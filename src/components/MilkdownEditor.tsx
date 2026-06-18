import { useRef } from "react";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/kit/core";
import { commonmark, imageSchema } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { $view } from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { NodeViewConstructor } from "@milkdown/kit/prose/view";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri";
import { WIKI_SCHEME, wikiToSentinel, sentinelToWiki, wikiNameFromSrc } from "../lib/wikiImage";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "@milkdown/kit/prose/tables/style/tables.css";

interface MilkdownEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  /** 현재 문서의 폴더 — `![[name]]`를 `<docDir>/attachments/name`으로 해석. null이면 해석 불가(미저장). */
  docDir: string | null;
}

/**
 * Render(WYSIWYG) 에디터. 편집하면 markdown으로 직렬화해 onChange로 전달한다(Phase 5).
 * - 초기 content는 defaultValueCtx로 한 번 주입. 외부 변경(파일 열기/새로)은 key={loadId} 리마운트로 반영.
 * - 이미지: 표준 `![alt](url)`은 그대로(원격 URL은 CSP 허용 필요), Obsidian식 `![[name]]`은
 *   경계에서 센티넬로 치환 후 NodeView가 attachments에서 비동기 로드(자세한 내용은 lib/wikiImage.ts).
 */
function MilkdownInner({ content, onChange, docDir }: MilkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const docDirRef = useRef(docDir);
  docDirRef.current = docDir;
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

    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, wikiToSentinel(content));
        const l = ctx.get(listenerCtx);
        l.mounted(() => {
          ready.current = true;
        });
        l.markdownUpdated((_, markdown, prevMarkdown) => {
          if (!ready.current) return;
          if (markdown === prevMarkdown) return;
          onChangeRef.current(sentinelToWiki(markdown));
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(imageView);
  });

  return <Milkdown />;
}

export default function MilkdownEditor({ content, onChange, docDir }: MilkdownEditorProps) {
  return (
    <MilkdownProvider>
      <MilkdownInner content={content} onChange={onChange} docDir={docDir} />
    </MilkdownProvider>
  );
}
