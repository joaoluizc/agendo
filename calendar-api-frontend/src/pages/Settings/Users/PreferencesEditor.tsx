import { useEffect } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PREFERENCES_PROSE } from "@/components/UserPreferences/PreferencesContent";

type PreferencesEditorProps = {
  /** Read once, when the editor mounts. Re-key the component to load different content. */
  initialHtml: string;
  /** The note as HTML after every edit; "" once it holds no text. */
  onChange: (html: string) => void;
  disabled?: boolean;
};

/**
 * The rich-text editor for an agent's preferences.
 *
 * Its own module so Users.tsx can `React.lazy` it: Tiptap (ProseMirror underneath) is the
 * heaviest thing in this feature and only managers on this page ever need it. The schedule
 * renders the saved HTML with interweave instead and never loads it.
 *
 * Only what a short note needs survives: paragraphs, bold, italic, bullet and numbered
 * lists, line breaks and undo. Everything else StarterKit brings is switched off, so the
 * stored HTML stays within what the hover card is styled for. Typing "- " or "1. " starts
 * a list, as in most editors.
 */
const PreferencesEditor = ({
  initialHtml,
  onChange,
  disabled = false,
}: PreferencesEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        link: false,
        strike: false,
        underline: false,
      }),
    ],
    content: initialHtml,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          PREFERENCES_PROSE,
          "min-h-[180px] px-3 py-2.5 text-[13px] outline-none"
        ),
        "aria-label": "Preferences",
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange(current.isEmpty ? "" : current.getHTML());
    },
  });

  // `editable` above is only read at mount. No update event: nothing was edited.
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  // Toolbar state only; the editor itself doesn't re-render the component per keystroke.
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      bulletList: current?.isActive("bulletList") ?? false,
      orderedList: current?.isActive("orderedList") ?? false,
    }),
  });

  const buttons: {
    key: keyof NonNullable<typeof active>;
    label: string;
    hint: string;
    Icon: LucideIcon;
    run: () => void;
  }[] = [
    {
      key: "bold",
      label: "Bold",
      hint: "Ctrl/Cmd+B",
      Icon: Bold,
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      key: "italic",
      label: "Italic",
      hint: "Ctrl/Cmd+I",
      Icon: Italic,
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      key: "bulletList",
      label: "Bullet list",
      hint: "type - and a space",
      Icon: List,
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      key: "orderedList",
      label: "Numbered list",
      hint: "type 1. and a space",
      Icon: ListOrdered,
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
  ];

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring",
        disabled && "opacity-60"
      )}
    >
      <div className="flex items-center gap-0.5 border-b border-border px-1.5 py-1">
        {buttons.map(({ key, label, hint, Icon, run }) => (
          <button
            key={key}
            type="button"
            title={`${label} (${hint})`}
            aria-label={label}
            aria-pressed={active?.[key] ?? false}
            disabled={disabled || !editor}
            onClick={run}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none",
              active?.[key] && "bg-muted text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
};

export default PreferencesEditor;
