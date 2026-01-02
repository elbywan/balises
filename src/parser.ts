/**
 * Streaming HTML parser for template literals.
 * State machine: Text=0, TagOpen=1, TagName=2, InTag=3, AttrName=4, AttrEq=5, AttrVal=6, CloseTag=7, Comment=8
 */

/** Pre-compiled attribute: static strings interleaved with slot indexes */
export type Attr = [name: string, statics: string[], indexes: number[]];

export interface ParseCallbacks {
  onText: (text: string) => void;
  onOpenTag: (tag: string, attrs: Attr[], selfClosing: boolean) => void;
  onClose: () => void;
  onSlot: (index: number) => void;
}

// Lookup tables for fast character classification
const ALPHA_LOOKUP = new Uint8Array(256);
const TAG_LOOKUP = new Uint8Array(256);
const WHITESPACE_LOOKUP = new Uint8Array(256);

// Initialize lookup tables (runs once at module load)
for (let i = 0; i < 256; i++) {
  // ALPHA: a-z, A-Z
  if ((i >= 97 && i <= 122) || (i >= 65 && i <= 90)) {
    ALPHA_LOOKUP[i] = 1;
    TAG_LOOKUP[i] = 1;
  }
  // TAG: a-z, A-Z, 0-9, -, :
  if ((i >= 48 && i <= 57) || i === 45 || i === 58) {
    TAG_LOOKUP[i] = 1;
  }
  // WHITESPACE: space, tab, newline, carriage return
  if (i <= 32 && i !== 0) {
    WHITESPACE_LOOKUP[i] = 1;
  }
}

export class HTMLParser {
  private s = 0; // state
  private tag = "";
  private attr = "";
  private statics: string[] = [];
  private indexes: number[] = [];
  private attrs: Attr[] = [];
  private text = "";
  private q = "";

  parseTemplate(strings: TemplateStringsArray, cb: ParseCallbacks) {
    for (let i = 0; i < strings.length; i++) {
      this.parse(strings[i]!, cb);
      if (i < strings.length - 1) this.slot(i, cb);
    }
    if (this.text) {
      cb.onText(this.text);
      this.text = "";
    }
  }

  private parse(str: string, cb: ParseCallbacks) {
    for (let i = 0; i < str.length; i++) {
      const ch = str[i]!,
        nx = str[i + 1],
        n2 = str[i + 2];

      if (this.s === 0) {
        // Text
        if (ch === "<") {
          if (this.text) {
            cb.onText(this.text);
            this.text = "";
          }
          this.s = 1;
        } else this.text += ch;
      } else if (this.s === 1) {
        // TagOpen
        if (ch === "/") this.s = 7;
        else if (ch === "!" && nx === "-" && n2 === "-") {
          i += 2;
          this.s = 8;
        } else if (ch === "!" || ch === "?") {
          while (i < str.length && str[i] !== ">") i++;
          this.s = 0;
        } else if (this.isA(ch)) {
          this.tag = ch;
          this.s = 2;
        } else {
          this.text += "<" + ch;
          this.s = 0;
        }
      } else if (this.s === 2) {
        // TagName
        if (this.isT(ch)) this.tag += ch;
        else if (this.isW(ch)) {
          this.s = 3;
        } else if (ch === ">") {
          this.emit(cb, false);
        } else if (ch === "/" && nx === ">") {
          i++;
          this.emit(cb, true);
        }
      } else if (this.s === 3) {
        // InTag
        if (this.isW(ch)) continue;
        if (ch === ">") this.emit(cb, false);
        else if (ch === "/" && nx === ">") {
          i++;
          this.emit(cb, true);
        } else {
          this.attr = ch;
          this.statics = [""];
          this.indexes = [];
          this.s = 4;
        }
      } else if (this.s === 4) {
        // AttrName
        if (this.isT(ch) || ch === "_") this.attr += ch;
        else if (ch === "=") this.s = 5;
        else if (this.isW(ch)) {
          this.emitAttr();
          this.s = 3;
        } else if (ch === ">") {
          this.emitAttr();
          this.emit(cb, false);
        } else if (ch === "/" && nx === ">") {
          this.emitAttr();
          i++;
          this.emit(cb, true);
        }
      } else if (this.s === 5) {
        // AttrEq
        if (ch === '"' || ch === "'") {
          this.q = ch;
          this.s = 6;
        } else if (!this.isW(ch)) {
          this.q = "";
          this.statics[0] += ch;
          this.s = 6;
        }
      } else if (this.s === 6) {
        // AttrVal
        const end = this.q
          ? ch === this.q
          : this.isW(ch) || ch === ">" || ch === "/";
        if (end) {
          this.emitAttr();
          this.q = "";
          this.s = 3;
          if (ch === ">") this.emit(cb, false);
          else if (ch === "/" && nx === ">") {
            i++;
            this.emit(cb, true);
          }
        } else {
          this.statics[this.statics.length - 1] += ch;
        }
      } else if (this.s === 7) {
        // CloseTag
        if (ch === ">") {
          cb.onClose();
          this.s = 0;
        }
      } else if (this.s === 8) {
        // Comment
        if (ch === "-" && nx === "-" && n2 === ">") {
          i += 2;
          this.s = 0;
        }
      }
    }
  }

  private slot(index: number, cb: ParseCallbacks) {
    if (this.s === 5 || this.s === 6) {
      this.indexes.push(index);
      this.statics.push("");
      if (this.s === 5) this.s = 6;
    } else {
      if (this.text) {
        cb.onText(this.text);
        this.text = "";
      }
      cb.onSlot(index);
    }
  }

  private emit(cb: ParseCallbacks, self: boolean) {
    cb.onOpenTag(this.tag, this.attrs, self);
    this.tag = "";
    this.attrs = [];
    this.s = 0;
  }

  private emitAttr() {
    if (this.attr) this.attrs.push([this.attr, this.statics, this.indexes]);
    this.attr = "";
    this.statics = [];
    this.indexes = [];
  }

  private isA(c: string) {
    // Mask to 8 bits to safely handle any character code
    return ALPHA_LOOKUP[c.charCodeAt(0) & 255] === 1;
  }
  private isT(c: string) {
    // Mask to 8 bits to safely handle any character code
    return TAG_LOOKUP[c.charCodeAt(0) & 255] === 1;
  }
  private isW(c: string) {
    // Mask to 8 bits to safely handle any character code
    return WHITESPACE_LOOKUP[c.charCodeAt(0) & 255] === 1;
  }
}
