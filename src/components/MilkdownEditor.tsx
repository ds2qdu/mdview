import { useRef } from "react";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "@milkdown/kit/prose/tables/style/tables.css";

interface MilkdownEditorProps {
  content: string;
  onChange: (markdown: string) => void;
}

/**
 * Render(WYSIWYG) 에디터. 편집하면 markdown으로 직렬화해 onChange로 전달한다(Phase 5).
 * - 초기 content는 defaultValueCtx로 한 번 주입. 외부 변경(파일 열기/새로)은
 *   상위 EditorArea가 key={loadId}로 리마운트해 반영한다(여기서 prop을 다시 읽지 않음 → 루프 없음).
 * - mounted 이후의 실제 편집만 onChange로 흘려보낸다(초기 로드는 dirty로 잡지 않음).
 */
function MilkdownInner({ content, onChange }: MilkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const ready = useRef(false);

  useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, content);
        const l = ctx.get(listenerCtx);
        l.mounted(() => {
          ready.current = true;
        });
        l.markdownUpdated((_, markdown, prevMarkdown) => {
          if (!ready.current) return;
          if (markdown === prevMarkdown) return;
          onChangeRef.current(markdown);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(listener),
  );

  return <Milkdown />;
}

export default function MilkdownEditor({ content, onChange }: MilkdownEditorProps) {
  return (
    <MilkdownProvider>
      <MilkdownInner content={content} onChange={onChange} />
    </MilkdownProvider>
  );
}
