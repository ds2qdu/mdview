import { useRef } from "react";
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  commonmark,
  imageSchema,
  remarkPreserveEmptyLinePlugin,
  bulletListSchema,
  orderedListSchema,
} from "@milkdown/kit/preset/commonmark";
import { gfm, extendListItemSchemaForTask } from "@milkdown/kit/preset/gfm";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { $view, $prose } from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeViewConstructor } from "@milkdown/kit/prose/view";
import { invoke } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";
import { isTauri } from "../lib/tauri";
import { WIKI_SCHEME, wikiToSentinel, sentinelToWiki, wikiNameFromSrc } from "../lib/wikiImage";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "@milkdown/kit/prose/tables/style/tables.css";

// Milkdown commonmark의 "빈 줄 보존(preserve empty line)" 기능은 빈 문단(Enter로 만든 빈 줄)을
// markdown 저장 시 `<br />`로 직렬화한다(표준 md가 연속 빈 줄을 못 살리니 우회). 노트패드에선
// Enter가 깔끔한 빈 줄이 되길 원하므로, 이 기능 플러그인을 번들에서 제거한다. (파싱→빈줄,
// 직렬화→`<br />` 양방향이 한 플러그인에 묶여 있어 통째로 제거 → 새 빈 줄이 `<br />`로 안 변환.)
//
// 리스트를 항상 tight하게 직렬화한다. Milkdown은 list/listItem의 spread 기본값 때문에 리스트를
// loose(빈 줄 포함)로 저장하는데, Render에선 빈 줄 없이 붙어 보여 Source와 어긋난다. mdast의 join
// 규칙상 ① 항목 *사이* 빈 줄은 부모 `list`의 spread가, ② 항목 *내부* 자식(문단↔하위리스트 등)
// 사이 빈 줄은 `listItem`의 spread가 결정한다. → ①은 여기서 bullet/ordered list의 spread를 false로
// 강제하고, ②(listItem)는 gfm이 list_item을 재등록(task list)하며 덮으므로 아래 gfm 패치에서 처리한다.
// (문단↔문단 빈 줄은 join이 특례로 항상 보존하므로 다중 문단 항목은 안전하게 유지된다.)
const tightBulletList = bulletListSchema.extendSchema((prev) => (ctx) => {
  const spec = prev(ctx);
  return {
    ...spec,
    toMarkdown: {
      match: spec.toMarkdown.match,
      runner: (state, node) =>
        state
          .openNode("list", undefined, { ordered: false, spread: false })
          .next(node.content)
          .closeNode(),
    },
  };
});
const tightOrderedList = orderedListSchema.extendSchema((prev) => (ctx) => {
  const spec = prev(ctx);
  return {
    ...spec,
    toMarkdown: {
      match: spec.toMarkdown.match,
      runner: (state, node) =>
        state
          .openNode("list", undefined, { ordered: true, start: node.attrs.order ?? 1, spread: false })
          .next(node.content)
          .closeNode(),
    },
  };
});
// 위 패치들을 commonmark 번들에 반영: 빈 줄 보존 플러그인과 원본 bullet/ordered list 스키마를 빼고
// tight 버전 추가. ($node.type은 전역 스키마에서 id로 NodeType을 찾으므로, 스키마를 교체해도 입력룰/
//  커맨드/키맵이 동일 id("bullet_list"/"ordered_list")를 그대로 해석해 정상 동작한다.)
const removedFromBundle = [
  remarkPreserveEmptyLinePlugin,
  bulletListSchema,
  orderedListSchema,
].flat();
const commonmarkPatched = commonmark
  .filter((p) => !removedFromBundle.includes(p))
  .concat([tightBulletList, tightOrderedList].flat());

// gfm은 task list 지원을 위해 list_item을 재등록(`extendListItemSchemaForTask`)하며 commonmark의
// list_item을 덮는다. 따라서 항목 *내부*(문단↔하위리스트) 빈 줄을 없애려면 여기서 gfm의 list_item에
// spread:false를 강제해야 한다(중첩 리스트 tight). task 항목의 checked(체크박스)는 보존한다.
const tightTaskListItem = extendListItemSchemaForTask.extendSchema((prev) => (ctx) => {
  const spec = prev(ctx);
  return {
    ...spec,
    toMarkdown: {
      match: spec.toMarkdown.match,
      runner: (state, node) => {
        const { checked, label, listType } = node.attrs;
        state.openNode(
          "listItem",
          undefined,
          checked == null ? { spread: false } : { label, listType, spread: false, checked },
        );
        state.next(node.content);
        state.closeNode();
      },
    },
  };
});
const removedFromGfm: unknown[] = [extendListItemSchemaForTask].flat();
const gfmPatched = gfm
  .filter((p) => !removedFromGfm.includes(p))
  .concat([tightTaskListItem].flat());

// 위에서 플러그인을 끄면 파싱 측 처리도 사라져, 이전에 `<br />`로 저장돼 있던 빈 줄이 Render에서
// 리터럴 "<br />" 텍스트로 보인다. 로드 시 (코드블록 밖의) 단독 줄 `<br />` 마커를 제거해 기존
// 문서도 깔끔히 표시되게 한다. 코드블록 안 `<br />`와 문장 중간 인라인 `<br />`은 보존한다.
function stripEmptyLineBr(md: string): string {
  const brOnly = /^[ \t]*(?:[-*+]|\d+[.)])?[ \t]*<br\s*\/?>[ \t]*$/i;
  const fence = /^[ \t]*(`{3,}|~{3,})/;
  let openFence: string | null = null;
  return md
    .split("\n")
    .filter((line) => {
      const stripped = line.replace(/\r$/, "");
      const f = stripped.match(fence);
      if (f) {
        if (openFence === null) openFence = f[1][0].repeat(3);
        else if (stripped.trimStart().startsWith(openFence)) openFence = null;
        return true;
      }
      return openFence !== null || !brOnly.test(stripped);
    })
    .join("\n");
}

// 문서가 문단(paragraph)으로 끝나지 않으면(끝이 코드블록·표·이미지 등) 맨 끝에 빈 문단 하나를 유지한다.
// ProseMirror는 종단 노드 뒤로 빠져나갈 문단이 없으면 커서가 갇혀, 마지막이 코드블록이면 그 아래로
// 내려가/클릭해 새 텍스트를 쓸 수 없다(Source 모드엔 없는 문제). 빈 문단을 항상 뒤에 둬서 해결한다.
// 내용이 실제로 바뀐 트랜잭션(docChanged)에만 반응 → 로드 직후 단순 클릭/선택으로 문단이 붙어
// dirty로 잡히는 일이 없다(초기 삽입은 마운트 시 addToHistory:false로 별도 처리).
const trailingParagraph = $prose(
  () =>
    new Plugin({
      key: new PluginKey("mdview-trailing-paragraph"),
      appendTransaction: (trs, _oldState, newState) => {
        if (!trs.some((tr) => tr.docChanged)) return null;
        const last = newState.doc.lastChild;
        if (last && last.type.name === "paragraph") return null;
        const node = newState.schema.nodes.paragraph?.createAndFill();
        if (!node) return null;
        return newState.tr.insert(newState.doc.content.size, node);
      },
    }),
);

/** Blob/File → `data:<mime>;base64,…`. 붙여넣기 이미지를 Rust로 넘겨 파일 저장할 때 쓴다. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("read error"));
    r.readAsDataURL(blob);
  });
}

/** Obsidian식 붙여넣기 파일명 stem: `Pasted image YYYYMMDDHHmmss`(확장자 제외, 로컬 시각). */
function pastedImageStem(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `Pasted image ${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** clipboard 항목들에서 첫 이미지 파일을 꺼낸다. 없으면 null(→ 기본 붙여넣기에 맡김). */
function imageFileFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of data.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

interface MilkdownEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  /** 현재 문서의 폴더 — `![[name]]`를 `<docDir>/attachments/name`으로 해석. null이면 해석 불가(미저장). */
  docDir: string | null;
  /** 에디터가 마운트되어 콘텐츠가 렌더된 직후 1회 호출(모드 전환 스크롤 복원에 사용). */
  onReady?: () => void;
}

/**
 * Render(WYSIWYG) 에디터. 편집하면 markdown으로 직렬화해 onChange로 전달한다(Phase 5).
 * - 초기 content는 defaultValueCtx로 한 번 주입. 외부 변경(파일 열기/새로)은 key={loadId} 리마운트로 반영.
 * - 이미지: 표준 `![alt](url)`은 그대로(원격 URL은 CSP 허용 필요), Obsidian식 `![[name]]`은
 *   경계에서 센티넬로 치환 후 NodeView가 attachments에서 비동기 로드(자세한 내용은 lib/wikiImage.ts).
 */
function MilkdownInner({ content, onChange, docDir, onReady }: MilkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const docDirRef = useRef(docDir);
  docDirRef.current = docDir;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const ready = useRef(false);

  useEditor((root) => {
    // 표시용 src 해석: 센티넬(`![[name]]`)은 attachments에서 data URL로, 그 외(URL/data/blob)는 그대로.
    const resolveSrc = async (src: string): Promise<string | null> => {
      if (!src.startsWith(WIKI_SCHEME)) return src || null;
      const name = wikiNameFromSrc(src);
      if (!name) return null;
      const dir = docDirRef.current;
      if (!dir || !isTauri()) return null;
      const sep = dir.includes("\\") ? "\\" : "/";
      try {
        return await invoke<string>("read_image_data_url", {
          path: `${dir}${sep}attachments${sep}${name}`,
        });
      } catch {
        return null;
      }
    };

    // 이미지 노드 NodeView: 노드 attrs.src(센티넬/URL)는 보존하고, 화면 <img>의 src만 해석해 채운다.
    const imageView = $view(
      imageSchema.node,
      (): NodeViewConstructor =>
        (node) => {
          // dom은 <span> 래퍼, 실제 <img>는 그 자식 — Milkdown 기본 inline-image view와 동일한 구조.
          // (replaced 요소인 <img>를 atom 노드의 dom으로 직접 쓰면 노드 경계 매핑이 깨질 수 있음.)
          const dom = document.createElement("span");
          dom.className = "milkdown-image-wrap";
          const img = document.createElement("img");
          img.className = "milkdown-image";
          dom.appendChild(img);
          const apply = async (n: ProseNode) => {
            const src = (n.attrs.src as string) || "";
            // Obsidian식 임베드(`![[name]]`)는 블록으로 표시 → 같은 문단의 뒤따르는 텍스트가 아랫줄로 간다.
            dom.classList.toggle("milkdown-image-wrap--embed", src.startsWith(WIKI_SCHEME));
            if (n.attrs.title) img.title = n.attrs.title as string;
            const resolved = await resolveSrc(src);
            if (resolved) {
              img.src = resolved;
              img.alt = (n.attrs.alt as string) || wikiNameFromSrc(src) || "";
              img.classList.remove("milkdown-image--missing");
            } else {
              img.removeAttribute("src");
              img.classList.add("milkdown-image--missing");
              img.alt = `이미지를 찾을 수 없음: ${wikiNameFromSrc(src) || src}`;
            }
          };
          void apply(node);
          return {
            dom,
            // 우리가 <img>(src/class)를 비동기로 바꾸므로, ProseMirror가 그 DOM 변경을
            // 사용자 편집으로 오인하지 않도록 무시한다(콘텐츠 없는 atom이라 잃을 내용 없음).
            ignoreMutation: () => true,
            update: (updated: ProseNode) => {
              if (updated.type.name !== "image") return false;
              void apply(updated);
              return true;
            },
            stopEvent: () => false,
          };
        },
    );

    // 이미지 붙여넣기: clipboard의 이미지를 <문서폴더>/attachments/에 파일로 저장하고 `![[name]]`
    // (센티넬 이미지 노드)로 삽입한다. 기본 동작(휘발성 blob: URL 삽입)을 preventDefault로 대체.
    // 문서가 미저장(폴더 미상)이면 저장 위치가 없어 안내만 하고 기본 붙여넣기는 막는다.
    const insertPastedImage = async (view: EditorView, file: File) => {
      const dir = docDirRef.current;
      if (!dir) {
        await message("이미지를 붙여넣으려면 먼저 문서를 저장하세요.\n(attachments 폴더가 문서와 같은 폴더에 만들어집니다.)", {
          title: "저장 필요",
          kind: "warning",
        });
        return;
      }
      try {
        const dataUrl = await blobToDataUrl(file);
        const name = await invoke<string>("save_pasted_image", {
          docDir: dir,
          nameStem: pastedImageStem(),
          dataUrl,
        });
        // 센티넬 src → 직렬화 시 `![[name]]`로 복원되고 NodeView가 attachments에서 표시한다.
        const image = view.state.schema.nodes.image?.create({
          src: WIKI_SCHEME + encodeURIComponent(name),
        });
        if (image) view.dispatch(view.state.tr.replaceSelectionWith(image, false).scrollIntoView());
      } catch (e) {
        await message(`이미지를 저장할 수 없습니다:\n${e}`, { title: "붙여넣기 실패", kind: "error" });
      }
    };

    const imagePaste = $prose(
      () =>
        new Plugin({
          key: new PluginKey("mdview-image-paste"),
          props: {
            handlePaste: (view, event) => {
              if (!isTauri()) return false; // 데스크톱(Tauri)에서만 파일 저장 가능
              const file = imageFileFromClipboard(event.clipboardData);
              if (!file) return false; // 이미지가 아니면 기본 붙여넣기
              event.preventDefault();
              void insertPastedImage(view, file);
              return true;
            },
          },
        }),
    );

    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, wikiToSentinel(stripEmptyLineBr(content)));
        const l = ctx.get(listenerCtx);
        l.mounted(() => {
          // 초기 문서가 문단으로 안 끝나면(끝 코드블록 등) 빈 문단 1개를 붙인다 → 그 아래로 커서 이동 가능.
          // addToHistory:false 트랜잭션은 리스너가 무시(markdownUpdated 미발화)하므로 로드가 dirty로 잡히지
          // 않고 doc.content(저장본)도 원본 그대로 유지된다. 사용자가 실제로 편집할 때만 반영된다.
          const view = ctx.get(editorViewCtx);
          const last = view.state.doc.lastChild;
          if (!last || last.type.name !== "paragraph") {
            const node = view.state.schema.nodes.paragraph?.createAndFill();
            if (node) {
              view.dispatch(
                view.state.tr.insert(view.state.doc.content.size, node).setMeta("addToHistory", false),
              );
            }
          }
          ready.current = true;
          onReadyRef.current?.();
        });
        l.markdownUpdated((_, markdown, prevMarkdown) => {
          if (!ready.current) return;
          if (markdown === prevMarkdown) return;
          onChangeRef.current(sentinelToWiki(markdown));
        });
      })
      .use(commonmarkPatched)
      .use(gfmPatched)
      .use(listener)
      .use(imageView)
      .use(imagePaste)
      .use(trailingParagraph);
  });

  return <Milkdown />;
}

export default function MilkdownEditor({ content, onChange, docDir, onReady }: MilkdownEditorProps) {
  return (
    <MilkdownProvider>
      <MilkdownInner content={content} onChange={onChange} docDir={docDir} onReady={onReady} />
    </MilkdownProvider>
  );
}
