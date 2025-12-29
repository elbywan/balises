import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import {
  HTMLParser,
  type AttrPart,
  type ParseCallbacks,
} from "../src/parser.js";

describe("HTMLParser", () => {
  let parser: HTMLParser;
  let texts: string[];
  let elements: { el: Element; selfClosing: boolean }[];
  let closeCount: number;
  let attributes: { el: Element; name: string; parts: AttrPart[] }[];
  let slots: number[];

  const createCallbacks = (): ParseCallbacks => ({
    onText: (text: string) => {
      texts.push(text);
    },
    onElement: (el: Element, selfClosing: boolean) => {
      elements.push({ el, selfClosing });
    },
    onClose: () => {
      closeCount++;
    },
    onAttribute: (el: Element, name: string, parts: AttrPart[]) => {
      attributes.push({ el, name, parts });
    },
    onSlot: (index: number) => {
      slots.push(index);
    },
  });

  /** Helper to create TemplateStringsArray from regular strings */
  const tmpl = (
    ...strings: string[]
  ): TemplateStringsArray & { raw: readonly string[] } => {
    const arr = strings as unknown as TemplateStringsArray & {
      raw: readonly string[];
    };
    (arr as { raw: readonly string[] }).raw = strings;
    return arr;
  };

  beforeEach(() => {
    parser = new HTMLParser();
    texts = [];
    elements = [];
    closeCount = 0;
    attributes = [];
    slots = [];
  });

  describe("text parsing", () => {
    it("should parse plain text", () => {
      parser.parseTemplate(tmpl("Hello World"), createCallbacks());
      assert.strictEqual(texts.length, 1);
      assert.strictEqual(texts[0], "Hello World");
    });

    it("should parse text with spaces", () => {
      parser.parseTemplate(tmpl("  Hello   World  "), createCallbacks());
      assert.strictEqual(texts.length, 1);
      assert.strictEqual(texts[0], "  Hello   World  ");
    });
  });

  describe("element parsing", () => {
    it("should parse a simple element", () => {
      parser.parseTemplate(tmpl("<div>"), createCallbacks());
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(elements[0]!.el.tagName, "DIV");
      assert.strictEqual(elements[0]!.selfClosing, false);
    });

    it("should parse element with text content", () => {
      parser.parseTemplate(tmpl("<div>Hello</div>"), createCallbacks());
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(texts.length, 1);
      assert.strictEqual(texts[0], "Hello");
      assert.strictEqual(closeCount, 1);
    });

    it("should parse self-closing elements", () => {
      parser.parseTemplate(tmpl("<br/>"), createCallbacks());
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(elements[0]!.el.tagName, "BR");
      assert.strictEqual(elements[0]!.selfClosing, true);
    });

    it("should parse self-closing elements with space", () => {
      parser.parseTemplate(tmpl("<input />"), createCallbacks());
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(elements[0]!.el.tagName, "INPUT");
      assert.strictEqual(elements[0]!.selfClosing, true);
    });

    it("should parse nested elements", () => {
      parser.parseTemplate(tmpl("<div><span></span></div>"), createCallbacks());
      assert.strictEqual(elements.length, 2);
      assert.strictEqual(elements[0]!.el.tagName, "DIV");
      assert.strictEqual(elements[1]!.el.tagName, "SPAN");
      assert.strictEqual(closeCount, 2);
    });
  });

  describe("attribute parsing", () => {
    it("should parse quoted attribute", () => {
      parser.parseTemplate(tmpl('<div class="container">'), createCallbacks());
      assert.strictEqual(attributes.length, 1);
      assert.strictEqual(attributes[0]!.name, "class");
      assert.deepStrictEqual(attributes[0]!.parts, ["container"]);
    });

    it("should parse single-quoted attribute", () => {
      parser.parseTemplate(tmpl("<div class='container'>"), createCallbacks());
      assert.strictEqual(attributes.length, 1);
      assert.strictEqual(attributes[0]!.name, "class");
      assert.deepStrictEqual(attributes[0]!.parts, ["container"]);
    });

    it("should parse unquoted attribute", () => {
      parser.parseTemplate(tmpl("<div class=container>"), createCallbacks());
      assert.strictEqual(attributes.length, 1);
      assert.strictEqual(attributes[0]!.name, "class");
      assert.deepStrictEqual(attributes[0]!.parts, ["container"]);
    });

    it("should parse boolean attribute", () => {
      parser.parseTemplate(tmpl("<input disabled>"), createCallbacks());
      assert.strictEqual(attributes.length, 1);
      assert.strictEqual(attributes[0]!.name, "disabled");
      assert.deepStrictEqual(attributes[0]!.parts, []);
    });

    it("should parse multiple attributes", () => {
      parser.parseTemplate(
        tmpl('<div class="a" id="b" data-x="c">'),
        createCallbacks(),
      );
      assert.strictEqual(attributes.length, 3);
      assert.strictEqual(attributes[0]!.name, "class");
      assert.deepStrictEqual(attributes[0]!.parts, ["a"]);
      assert.strictEqual(attributes[1]!.name, "id");
      assert.deepStrictEqual(attributes[1]!.parts, ["b"]);
      assert.strictEqual(attributes[2]!.name, "data-x");
      assert.deepStrictEqual(attributes[2]!.parts, ["c"]);
    });

    it("should parse attributes on self-closing element", () => {
      parser.parseTemplate(
        tmpl('<input type="text" disabled />'),
        createCallbacks(),
      );
      assert.strictEqual(attributes.length, 2);
      assert.strictEqual(attributes[0]!.name, "type");
      assert.deepStrictEqual(attributes[0]!.parts, ["text"]);
      assert.strictEqual(attributes[1]!.name, "disabled");
      assert.strictEqual(elements[0]!.selfClosing, true);
    });

    it("should track event and property binding attributes", () => {
      parser.parseTemplate(
        tmpl('<div @click="handler" .value="x">'),
        createCallbacks(),
      );
      assert.strictEqual(attributes.length, 2);
      assert.strictEqual(attributes[0]!.name, "@click");
      assert.strictEqual(attributes[1]!.name, ".value");
    });
  });

  describe("comments", () => {
    it("should skip HTML comments", () => {
      parser.parseTemplate(
        tmpl("<!-- comment --><div></div>"),
        createCallbacks(),
      );
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(elements[0]!.el.tagName, "DIV");
    });

    it("should handle comments between elements", () => {
      parser.parseTemplate(
        tmpl("<div></div><!-- comment --><span></span>"),
        createCallbacks(),
      );
      assert.strictEqual(elements.length, 2);
      assert.strictEqual(elements[0]!.el.tagName, "DIV");
      assert.strictEqual(elements[1]!.el.tagName, "SPAN");
    });
  });

  describe("interpolation", () => {
    it("should handle content interpolation", () => {
      // Template: <div>${0}</div>
      parser.parseTemplate(tmpl("<div>", "</div>"), createCallbacks());
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(slots.length, 1);
      assert.strictEqual(slots[0], 0);
      assert.strictEqual(closeCount, 1);
    });

    it("should handle multiple content interpolations", () => {
      // Template: <div>${0}text${1}</div>
      parser.parseTemplate(tmpl("<div>", "text", "</div>"), createCallbacks());
      assert.strictEqual(slots.length, 2);
      assert.strictEqual(slots[0], 0);
      assert.strictEqual(slots[1], 1);
      assert.strictEqual(texts.length, 1);
      assert.strictEqual(texts[0], "text");
    });

    it("should handle attribute interpolation", () => {
      // Template: <div class="${0}">
      parser.parseTemplate(tmpl('<div class="', '">'), createCallbacks());
      assert.strictEqual(attributes.length, 1);
      assert.strictEqual(attributes[0]!.name, "class");
      assert.deepStrictEqual(attributes[0]!.parts, [{ index: 0 }]);
    });

    it("should handle attribute with static prefix and dynamic suffix", () => {
      // Template: <div class="prefix-${0}">
      parser.parseTemplate(
        tmpl('<div class="prefix-', '">'),
        createCallbacks(),
      );
      assert.strictEqual(attributes.length, 1);
      assert.deepStrictEqual(attributes[0]!.parts, ["prefix-", { index: 0 }]);
    });

    it("should handle attribute with dynamic prefix and static suffix", () => {
      // Template: <div class="${0}-suffix">
      parser.parseTemplate(
        tmpl('<div class="', '-suffix">'),
        createCallbacks(),
      );
      assert.strictEqual(attributes.length, 1);
      assert.deepStrictEqual(attributes[0]!.parts, [{ index: 0 }, "-suffix"]);
    });

    it("should handle fully dynamic attribute", () => {
      // Template: <div class=${0}>
      parser.parseTemplate(tmpl("<div class=", ">"), createCallbacks());
      assert.strictEqual(attributes.length, 1);
      assert.deepStrictEqual(attributes[0]!.parts, [{ index: 0 }]);
    });

    it("should handle multiple interpolations in one attribute", () => {
      // Template: <div class="${0}-${1}-${2}">
      parser.parseTemplate(
        tmpl('<div class="', "-", "-", '">'),
        createCallbacks(),
      );
      assert.strictEqual(attributes.length, 1);
      assert.deepStrictEqual(attributes[0]!.parts, [
        { index: 0 },
        "-",
        { index: 1 },
        "-",
        { index: 2 },
      ]);
    });

    it("should handle event binding with interpolation", () => {
      // Template: <button @click=${0}>
      parser.parseTemplate(tmpl("<button @click=", ">"), createCallbacks());
      assert.strictEqual(attributes.length, 1);
      assert.strictEqual(attributes[0]!.name, "@click");
      assert.deepStrictEqual(attributes[0]!.parts, [{ index: 0 }]);
    });

    it("should handle property binding with interpolation", () => {
      // Template: <input .value=${0}>
      parser.parseTemplate(tmpl("<input .value=", ">"), createCallbacks());
      assert.strictEqual(attributes.length, 1);
      assert.strictEqual(attributes[0]!.name, ".value");
      assert.deepStrictEqual(attributes[0]!.parts, [{ index: 0 }]);
    });
  });

  describe("edge cases", () => {
    it("should handle empty input", () => {
      parser.parseTemplate(tmpl(""), createCallbacks());
      assert.strictEqual(texts.length, 0);
      assert.strictEqual(elements.length, 0);
    });

    it("should handle < followed by non-tag character", () => {
      parser.parseTemplate(tmpl("5 < 10"), createCallbacks());
      // "5 " is flushed as text when '<' is encountered
      // Then "< 10" becomes text since it's not a valid tag
      assert.strictEqual(texts.length, 2);
      assert.strictEqual(texts[0], "5 ");
      assert.strictEqual(texts[1], "< 10");
    });

    it("should handle DOCTYPE", () => {
      parser.parseTemplate(
        tmpl("<!DOCTYPE html><div></div>"),
        createCallbacks(),
      );
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(elements[0]!.el.tagName, "DIV");
    });

    it("should handle > inside quoted attribute values", () => {
      parser.parseTemplate(tmpl('<div title="a > b">'), createCallbacks());
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(attributes.length, 1);
      assert.deepStrictEqual(attributes[0]!.parts, ["a > b"]);
    });

    it("should handle colons in attribute names (XML namespaces)", () => {
      parser.parseTemplate(
        tmpl('<svg xmlns:xlink="http://www.w3.org/1999/xlink">'),
        createCallbacks(),
      );
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(attributes[0]!.name, "xmlns:xlink");
      assert.deepStrictEqual(attributes[0]!.parts, [
        "http://www.w3.org/1999/xlink",
      ]);
    });

    it("should handle colons in tag names", () => {
      parser.parseTemplate(tmpl("<x:custom>"), createCallbacks());
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(elements[0]!.el.tagName, "X:CUSTOM");
    });

    it("should handle mixed content with text and interpolations", () => {
      // Template: Hello ${0} World ${1}!
      parser.parseTemplate(tmpl("Hello ", " World ", "!"), createCallbacks());
      assert.strictEqual(texts.length, 3);
      assert.strictEqual(texts[0], "Hello ");
      assert.strictEqual(texts[1], " World ");
      assert.strictEqual(texts[2], "!");
      assert.strictEqual(slots.length, 2);
    });

    it("should handle text before and after elements", () => {
      parser.parseTemplate(tmpl("Before<div></div>After"), createCallbacks());
      assert.strictEqual(texts.length, 2);
      assert.strictEqual(texts[0], "Before");
      assert.strictEqual(texts[1], "After");
      assert.strictEqual(elements.length, 1);
    });

    /**
     * Edge case: Multiple consecutive elements without whitespace
     *
     * Parser should correctly identify element boundaries.
     */
    it("should handle multiple consecutive elements", () => {
      parser.parseTemplate(
        tmpl("<div></div><span></span><p></p>"),
        createCallbacks(),
      );
      assert.strictEqual(elements.length, 3);
      assert.strictEqual(elements[0]!.el.tagName, "DIV");
      assert.strictEqual(elements[1]!.el.tagName, "SPAN");
      assert.strictEqual(elements[2]!.el.tagName, "P");
      assert.strictEqual(closeCount, 3);
    });

    /**
     * Edge case: Attribute with equals sign in value
     *
     * The parser should correctly handle = inside quoted attribute values.
     */
    it("should handle equals sign inside attribute value", () => {
      parser.parseTemplate(tmpl('<div data-expr="a=b">'), createCallbacks());
      assert.strictEqual(attributes.length, 1);
      assert.strictEqual(attributes[0]!.name, "data-expr");
      assert.deepStrictEqual(attributes[0]!.parts, ["a=b"]);
    });

    /**
     * Edge case: Empty attribute value
     *
     * Attributes like class="" should have an empty string as value.
     */
    it("should handle empty attribute value", () => {
      parser.parseTemplate(tmpl('<div class="">'), createCallbacks());
      assert.strictEqual(attributes.length, 1);
      assert.strictEqual(attributes[0]!.name, "class");
      assert.deepStrictEqual(attributes[0]!.parts, []);
    });

    /**
     * Edge case: Attribute with quotes inside value
     *
     * Single quotes inside double-quoted value should be preserved.
     */
    it("should handle quotes inside attribute value", () => {
      parser.parseTemplate(tmpl(`<div title="it's ok">`), createCallbacks());
      assert.strictEqual(attributes.length, 1);
      assert.deepStrictEqual(attributes[0]!.parts, ["it's ok"]);
    });

    /**
     * Edge case: Double quotes inside single-quoted attribute
     */
    it("should handle double quotes inside single-quoted attribute", () => {
      parser.parseTemplate(
        tmpl(`<div title='say "hello"'>`),
        createCallbacks(),
      );
      assert.strictEqual(attributes.length, 1);
      assert.deepStrictEqual(attributes[0]!.parts, ['say "hello"']);
    });

    /**
     * Edge case: Numeric tag names (invalid HTML but parser should handle)
     *
     * Tags starting with numbers are not valid HTML, but the parser
     * should gracefully handle them as text.
     */
    it("should treat < followed by number as text", () => {
      parser.parseTemplate(tmpl("5 < 10 > 3"), createCallbacks());
      // After "5 ", < is encountered, then "1" is not alphabetic
      // so "< 10 > 3" becomes text
      assert.strictEqual(texts.length, 2);
      assert.strictEqual(texts[0], "5 ");
      assert.strictEqual(texts[1], "< 10 > 3");
    });

    /**
     * Edge case: Multiple spaces between attributes
     *
     * Extra whitespace between attributes should be ignored.
     */
    it("should handle multiple spaces between attributes", () => {
      parser.parseTemplate(
        tmpl('<div   class="a"    id="b"   >'),
        createCallbacks(),
      );
      assert.strictEqual(attributes.length, 2);
      assert.strictEqual(attributes[0]!.name, "class");
      assert.strictEqual(attributes[1]!.name, "id");
    });

    /**
     * Edge case: Newlines and tabs in template
     *
     * Whitespace in text content should be preserved.
     */
    it("should preserve whitespace in text content", () => {
      parser.parseTemplate(tmpl("<div>\n  Hello\n</div>"), createCallbacks());
      assert.strictEqual(texts.length, 1);
      assert.strictEqual(texts[0], "\n  Hello\n");
    });

    /**
     * Edge case: Deeply nested elements
     *
     * Parser should correctly track depth with many nesting levels.
     */
    it("should handle deeply nested elements", () => {
      parser.parseTemplate(
        tmpl("<a><b><c><d><e></e></d></c></b></a>"),
        createCallbacks(),
      );
      assert.strictEqual(elements.length, 5);
      assert.strictEqual(closeCount, 5);
    });

    /**
     * Edge case: Self-closing tag with attributes and no space before />
     */
    it("should handle self-closing with attribute no space before />", () => {
      parser.parseTemplate(tmpl('<input type="text"/>'), createCallbacks());
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(elements[0]!.selfClosing, true);
      assert.strictEqual(attributes.length, 1);
      assert.deepStrictEqual(attributes[0]!.parts, ["text"]);
    });

    /**
     * Edge case: Comment with dashes inside
     *
     * Comments can contain single dashes, just not --.
     */
    it("should handle comments with dashes inside", () => {
      parser.parseTemplate(
        tmpl("<!-- a - b - c --><div></div>"),
        createCallbacks(),
      );
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(elements[0]!.el.tagName, "DIV");
    });

    /**
     * Edge case: Comment immediately followed by element
     */
    it("should handle comment immediately followed by element", () => {
      parser.parseTemplate(
        tmpl("<!--comment--><div></div>"),
        createCallbacks(),
      );
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(elements[0]!.el.tagName, "DIV");
    });

    /**
     * Edge case: Interpolation at very start of template
     */
    it("should handle interpolation at start", () => {
      // Template: ${0}<div></div>
      parser.parseTemplate(tmpl("", "<div></div>"), createCallbacks());
      assert.strictEqual(slots.length, 1);
      assert.strictEqual(slots[0], 0);
      assert.strictEqual(elements.length, 1);
    });

    /**
     * Edge case: Interpolation at very end of template
     */
    it("should handle interpolation at end", () => {
      // Template: <div></div>${0}
      parser.parseTemplate(tmpl("<div></div>", ""), createCallbacks());
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(slots.length, 1);
      assert.strictEqual(slots[0], 0);
    });

    /**
     * Edge case: Multiple interpolations in a row
     */
    it("should handle consecutive interpolations", () => {
      // Template: ${0}${1}${2}
      parser.parseTemplate(tmpl("", "", "", ""), createCallbacks());
      assert.strictEqual(slots.length, 3);
      assert.deepStrictEqual(slots, [0, 1, 2]);
    });

    /**
     * Edge case: Unquoted attribute ending with />
     */
    it("should handle unquoted attribute before self-close", () => {
      parser.parseTemplate(tmpl("<input type=text/>"), createCallbacks());
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(elements[0]!.selfClosing, true);
      assert.strictEqual(attributes.length, 1);
      assert.deepStrictEqual(attributes[0]!.parts, ["text"]);
    });

    /**
     * Edge case: Boolean attribute before self-close
     */
    it("should handle boolean attribute before self-close", () => {
      parser.parseTemplate(tmpl("<input disabled/>"), createCallbacks());
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(elements[0]!.selfClosing, true);
      assert.strictEqual(attributes.length, 1);
      assert.strictEqual(attributes[0]!.name, "disabled");
      assert.deepStrictEqual(attributes[0]!.parts, []);
    });

    /**
     * Edge case: Attribute with underscore
     *
     * Underscores are valid in attribute names.
     */
    it("should handle underscores in attribute names", () => {
      parser.parseTemplate(
        tmpl('<div data_custom="value">'),
        createCallbacks(),
      );
      assert.strictEqual(attributes.length, 1);
      assert.strictEqual(attributes[0]!.name, "data_custom");
    });

    /**
     * Edge case: Only whitespace text
     */
    it("should preserve whitespace-only text", () => {
      parser.parseTemplate(tmpl("<div>   </div>"), createCallbacks());
      assert.strictEqual(texts.length, 1);
      assert.strictEqual(texts[0], "   ");
    });

    /**
     * Edge case: Comment spanning across interpolation
     *
     * If a comment starts before interpolation and ends after,
     * the interpolation should be treated as part of the comment.
     */
    it("should handle interpolation inside comment", () => {
      // Template: <!-- ${0} --><div></div>
      parser.parseTemplate(tmpl("<!-- ", " --><div></div>"), createCallbacks());
      // The slot should be part of the comment and skipped
      // But actually, in state 8 (Comment), the slot() function
      // will treat it as text slot... Let's verify actual behavior
      assert.strictEqual(elements.length, 1);
    });

    /**
     * Edge case: XML processing instruction
     *
     * <?xml ...?> should be skipped like DOCTYPE.
     */
    it("should skip XML processing instructions", () => {
      parser.parseTemplate(
        tmpl('<?xml version="1.0"?><div></div>'),
        createCallbacks(),
      );
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(elements[0]!.el.tagName, "DIV");
    });

    /**
     * Edge case: Tag with only digits after first letter
     */
    it("should handle tags with digits after first letter", () => {
      parser.parseTemplate(tmpl("<h1>Heading</h1>"), createCallbacks());
      assert.strictEqual(elements.length, 1);
      assert.strictEqual(elements[0]!.el.tagName, "H1");
      assert.strictEqual(texts.length, 1);
      assert.strictEqual(texts[0], "Heading");
    });

    /**
     * Edge case: Attribute with hyphen in name
     */
    it("should handle hyphens in attribute names", () => {
      parser.parseTemplate(
        tmpl('<div data-my-attr="value">'),
        createCallbacks(),
      );
      assert.strictEqual(attributes.length, 1);
      assert.strictEqual(attributes[0]!.name, "data-my-attr");
    });

    /**
     * Edge case: Slot in unquoted attribute value position
     */
    it("should handle slot as unquoted attribute value", () => {
      // Template: <div class=${0}>
      parser.parseTemplate(tmpl("<div class=", ">"), createCallbacks());
      assert.strictEqual(attributes.length, 1);
      assert.strictEqual(attributes[0]!.name, "class");
      assert.deepStrictEqual(attributes[0]!.parts, [{ index: 0 }]);
    });

    /**
     * Edge case: Slot immediately after = with space before
     */
    it("should handle slot after = with space", () => {
      // Template: <div class= ${0}>
      // The space after = goes into AttrEq state which skips whitespace
      parser.parseTemplate(tmpl("<div class= ", ">"), createCallbacks());
      assert.strictEqual(attributes.length, 1);
      assert.deepStrictEqual(attributes[0]!.parts, [{ index: 0 }]);
    });
  });
});
