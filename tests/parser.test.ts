import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { HTMLParser, AttrPart, ParseCallbacks } from "../src/parser.js";

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
  });
});
