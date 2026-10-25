import type { ComponentType, CSSProperties } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Attachment,
  ChatBubble,
  Check,
  CheckSquare,
  Circle,
  Code,
  Copy,
  CornerBottomRight,
  Cut,
  Download,
  EditPencil,
  FloppyDisk,
  Folder,
  Globe,
  GraphUp,
  HalfMoon,
  HelpCircle,
  Home,
  InfoCircle,
  Key,
  Lock,
  MediaImage,
  Menu,
  Minus,
  MoreHoriz,
  NavArrowDown,
  NavArrowLeft,
  NavArrowRight,
  OpenNewWindow,
  Page,
  PageEdit,
  Palette,
  PasteClipboard,
  Pause,
  Play,
  Plus,
  Refresh,
  Redo,
  Search,
  Send,
  Settings,
  ShareAndroid,
  Square,
  Star,
  Terminal,
  Trash,
  Undo,
  Upload,
  User,
  WarningTriangle,
  Xmark,
} from "iconoir-react";
import { Star as StarSolid } from "iconoir-react/solid";

import { ArrowLeft } from "@react95/icons/ArrowLeft";
import { Attach } from "@react95/icons/Attach";
import { Circle as R95Circle } from "@react95/icons/Circle";
import { Close } from "@react95/icons/Close";
import { Copy as R95Copy } from "@react95/icons/Copy";
import { Cut as R95Cut } from "@react95/icons/Cut";
import { Delete } from "@react95/icons/Delete";
import { Desktop } from "@react95/icons/Desktop";
import { Download as R95Download } from "@react95/icons/Download";
import { FileFind } from "@react95/icons/FileFind";
import { FilePen } from "@react95/icons/FilePen";
import { FileText } from "@react95/icons/FileText";
import { Folder as R95Folder } from "@react95/icons/Folder";
import { Graph5257 } from "@react95/icons/Graph5257";
import { Help } from "@react95/icons/Help";
import { InfoBubble } from "@react95/icons/InfoBubble";
import { Key as R95Key } from "@react95/icons/Key";
import { Lock as R95Lock } from "@react95/icons/Lock";
import { Mspaint } from "@react95/icons/Mspaint";
import { MsDos } from "@react95/icons/MsDos";
import { New } from "@react95/icons/New";
import { Open } from "@react95/icons/Open";
import { Paste } from "@react95/icons/Paste";
import { Playd16 } from "@react95/icons/Playd16";
import { Refresh as R95Refresh } from "@react95/icons/Refresh";
import { Save } from "@react95/icons/Save";
import { Sendmail2001 } from "@react95/icons/Sendmail2001";
import { Settings as R95Settings } from "@react95/icons/Settings";
import { Shortcut } from "@react95/icons/Shortcut";
import { Star as R95Star } from "@react95/icons/Star";
import { Textchat } from "@react95/icons/Textchat";
import { Tick } from "@react95/icons/Tick";
import { Undo as R95Undo } from "@react95/icons/Undo";
import { Redo as R95Redo } from "@react95/icons/Redo";
import { User as R95User } from "@react95/icons/User";
import { Warning } from "@react95/icons/Warning";
import { WebOpen } from "@react95/icons/WebOpen";

/** Semantic icon names used by the app's chrome. */
export type IconName =
  | "archive"
  | "attach"
  | "back"
  | "chat"
  | "check"
  | "checked"
  | "chevronDown"
  | "chevronRight"
  | "circle"
  | "close"
  | "code"
  | "config"
  | "copy"
  | "corner"
  | "cross"
  | "cut"
  | "down"
  | "download"
  | "edit"
  | "external"
  | "file"
  | "folder"
  | "half"
  | "help"
  | "home"
  | "image"
  | "info"
  | "key"
  | "lock"
  | "markdown"
  | "menu"
  | "minus"
  | "more"
  | "new"
  | "open"
  | "paste"
  | "pause"
  | "pin"
  | "pinOff"
  | "play"
  | "plus"
  | "radioOff"
  | "radioOn"
  | "redo"
  | "refresh"
  | "save"
  | "search"
  | "send"
  | "settings"
  | "share"
  | "stats"
  | "stop"
  | "style"
  | "terminal"
  | "trash"
  | "undo"
  | "unchecked"
  | "up"
  | "upload"
  | "user"
  | "warning"
  | "web"
  | "windowClose"
  | "windowMax"
  | "windowMin"
  | "windowRestore";

type ModernDef = { C: ComponentType<any>; solid?: boolean };
type LegacyDef = { C: ComponentType<any>; variant?: "16x16_4" };

const MODERN: Record<IconName, ModernDef> = {
  archive: { C: Archive },
  attach: { C: Attachment },
  back: { C: NavArrowLeft },
  chat: { C: ChatBubble },
  check: { C: Check },
  checked: { C: CheckSquare },
  chevronDown: { C: NavArrowDown },
  chevronRight: { C: NavArrowRight },
  circle: { C: Circle },
  close: { C: Xmark },
  code: { C: Code },
  config: { C: Settings },
  copy: { C: Copy },
  corner: { C: CornerBottomRight },
  cross: { C: Xmark },
  cut: { C: Cut },
  down: { C: ArrowDown },
  download: { C: Download },
  edit: { C: EditPencil },
  external: { C: OpenNewWindow },
  file: { C: Page },
  folder: { C: Folder },
  half: { C: HalfMoon },
  help: { C: HelpCircle },
  home: { C: Home },
  image: { C: MediaImage },
  info: { C: InfoCircle },
  key: { C: Key },
  lock: { C: Lock },
  markdown: { C: PageEdit },
  menu: { C: Menu },
  minus: { C: Minus },
  more: { C: MoreHoriz },
  new: { C: Plus },
  open: { C: OpenNewWindow },
  paste: { C: PasteClipboard },
  pause: { C: Pause },
  pin: { C: StarSolid },
  pinOff: { C: Star },
  play: { C: Play },
  plus: { C: Plus },
  radioOff: { C: Circle },
  radioOn: { C: Circle, solid: true },
  redo: { C: Redo },
  refresh: { C: Refresh },
  save: { C: FloppyDisk },
  search: { C: Search },
  send: { C: Send },
  settings: { C: Settings },
  share: { C: ShareAndroid },
  stats: { C: GraphUp },
  stop: { C: Square, solid: true },
  style: { C: Palette },
  terminal: { C: Terminal },
  trash: { C: Trash },
  undo: { C: Undo },
  unchecked: { C: Square },
  up: { C: ArrowUp },
  upload: { C: Upload },
  user: { C: User },
  warning: { C: WarningTriangle },
  web: { C: Globe },
  windowClose: { C: Xmark },
  windowMax: { C: Square },
  windowMin: { C: Minus },
  windowRestore: { C: Copy },
};

// Windows 3.x/95/98-era icons from React95. They are deliberately bitmap-like
// and only shown for the Win98/WinXP families (including their dark variants).
const LEGACY: Partial<Record<IconName, LegacyDef>> = {
  archive: { C: R95Folder, variant: "16x16_4" },
  attach: { C: Attach, variant: "16x16_4" },
  back: { C: ArrowLeft },
  chat: { C: Textchat, variant: "16x16_4" },
  check: { C: Tick, variant: "16x16_4" },
  circle: { C: R95Circle, variant: "16x16_4" },
  close: { C: Close, variant: "16x16_4" },
  code: { C: FilePen, variant: "16x16_4" },
  config: { C: R95Settings, variant: "16x16_4" },
  copy: { C: R95Copy, variant: "16x16_4" },
  cross: { C: Close, variant: "16x16_4" },
  cut: { C: R95Cut, variant: "16x16_4" },
  download: { C: R95Download, variant: "16x16_4" },
  edit: { C: FilePen, variant: "16x16_4" },
  external: { C: WebOpen, variant: "16x16_4" },
  file: { C: FileText, variant: "16x16_4" },
  folder: { C: R95Folder, variant: "16x16_4" },
  help: { C: Help, variant: "16x16_4" },
  home: { C: Desktop, variant: "16x16_4" },
  image: { C: Mspaint, variant: "16x16_4" },
  info: { C: InfoBubble },
  key: { C: R95Key },
  lock: { C: R95Lock, variant: "16x16_4" },
  markdown: { C: FileText, variant: "16x16_4" },
  new: { C: New, variant: "16x16_4" },
  open: { C: Open, variant: "16x16_4" },
  paste: { C: Paste, variant: "16x16_4" },
  pin: { C: R95Star, variant: "16x16_4" },
  pinOff: { C: R95Star, variant: "16x16_4" },
  play: { C: Playd16, variant: "16x16_4" },
  plus: { C: New, variant: "16x16_4" },
  redo: { C: R95Redo, variant: "16x16_4" },
  refresh: { C: R95Refresh, variant: "16x16_4" },
  save: { C: Save, variant: "16x16_4" },
  search: { C: FileFind, variant: "16x16_4" },
  send: { C: Sendmail2001, variant: "16x16_4" },
  settings: { C: R95Settings, variant: "16x16_4" },
  share: { C: Shortcut, variant: "16x16_4" },
  stats: { C: Graph5257 },
  style: { C: Mspaint, variant: "16x16_4" },
  terminal: { C: MsDos },
  trash: { C: Delete, variant: "16x16_4" },
  undo: { C: R95Undo, variant: "16x16_4" },
  upload: { C: Save, variant: "16x16_4" },
  user: { C: R95User, variant: "16x16_4" },
  warning: { C: Warning },
  web: { C: WebOpen, variant: "16x16_4" },
};

/** Simple pixel glyphs for controls that React95's icon pack does not ship. */
function LegacyPixel({ name }: { name: IconName }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "square" as const,
    strokeLinejoin: "miter" as const,
  };
  const filled = { fill: "currentColor" };

  switch (name) {
    case "stop":
      return <rect x="3" y="3" width="10" height="10" {...filled} />;
    case "up":
      return <path d="M8 4 12 10H4Z" {...filled} />;
    case "down":
      return <path d="M8 12 4 6h8Z" {...filled} />;
    case "half":
      return (
        <>
          <circle cx="8" cy="8" r="5.5" {...stroke} />
          <path d="M8 2.5a5.5 5.5 0 0 1 0 11Z" {...filled} />
        </>
      );
    case "unchecked":
      return <rect x="2.5" y="2.5" width="11" height="11" {...stroke} />;
    case "checked":
      return (
        <>
          <rect x="2.5" y="2.5" width="11" height="11" {...stroke} />
          <path d="m4.5 8.2 2.2 2.2 4.8-5" {...stroke} strokeWidth={1.9} />
        </>
      );
    case "radioOff":
      return <circle cx="8" cy="8" r="5.5" {...stroke} />;
    case "radioOn":
      return (
        <>
          <circle cx="8" cy="8" r="5.5" {...stroke} />
          <circle cx="8" cy="8" r="2.6" {...filled} />
        </>
      );
    case "minus":
      return <rect x="3" y="7" width="10" height="2" {...filled} />;
    case "chevronDown":
      return <path d="m4 6 4 4 4-4" {...stroke} />;
    case "chevronRight":
      return <path d="m6 4 4 4-4 4" {...stroke} />;
    case "corner":
      return <path d="M4 3v7h7M8 7l3 3-3 3" {...stroke} />;
    case "windowMin":
      return <rect x="3" y="10" width="10" height="2" {...filled} />;
    case "windowMax":
      return <rect x="3" y="3" width="10" height="10" {...stroke} />;
    case "windowRestore":
      return (
        <>
          <rect x="3" y="6" width="8" height="7" {...stroke} />
          <path d="M6 6V3h7v7h-3" {...stroke} />
        </>
      );
    case "windowClose":
      return <path d="m4 4 8 8m0-8-8 8" {...stroke} />;
    case "menu":
      return (
        <>
          <rect x="3" y="3" width="10" height="2" {...filled} />
          <rect x="3" y="7" width="10" height="2" {...filled} />
          <rect x="3" y="11" width="10" height="2" {...filled} />
        </>
      );
    case "more":
      return (
        <>
          <rect x="3" y="7" width="2" height="2" {...filled} />
          <rect x="7" y="7" width="2" height="2" {...filled} />
          <rect x="11" y="7" width="2" height="2" {...filled} />
        </>
      );
    case "pause":
      return (
        <>
          <rect x="4" y="3" width="3" height="10" {...filled} />
          <rect x="9" y="3" width="3" height="10" {...filled} />
        </>
      );
    default:
      return <rect x="3" y="3" width="10" height="10" {...stroke} />;
  }
}

function LegacyIcon({ name, size }: { name: IconName; size: number | string }) {
  const def = LEGACY[name];
  if (def) {
    const C = def.C;
    return <C width={size} height={size} variant={def.variant} />;
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      <LegacyPixel name={name} />
    </svg>
  );
}

export default function Icon({
  name,
  size = "1em",
  className = "",
  title,
  style,
}: {
  name: IconName;
  size?: number | string;
  className?: string;
  title?: string;
  style?: CSSProperties;
}) {
  const modern = MODERN[name];
  const Modern = modern.C;
  return (
    <span
      className={`ic${className ? " " + className : ""}${name === "pinOff" ? " ic-dim" : ""}`}
      style={{ width: size, height: size, ...style }}
      data-icon={name}
      title={title}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <span className="ic-modern">
        <Modern
          width={size}
          height={size}
          strokeWidth={1.7}
          {...(modern.solid ? { fill: "currentColor", stroke: "none" } : {})}
        />
      </span>
      <span className="ic-legacy">
        <LegacyIcon name={name} size={size} />
      </span>
    </span>
  );
}
