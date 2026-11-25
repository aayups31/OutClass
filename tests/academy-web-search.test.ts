import { expect, it } from "vitest";
import type OpenAI from "openai";
import { citationsFromSearch } from "../src/server/academy-web-search";

it("accepts only official, completed web citations and keeps the corresponding teaching note", () => {
  const first = "Trace one concrete input before asking for a general rule.";
  const second = "Test the invariant with a boundary case.";
  const text = first + "\n\n" + second;
  const message = {
    type: "message",
    content: [
      {
        type: "output_text",
        text,
        annotations: [
          {
            type: "url_citation",
            start_index: 7,
            url: "https://ocw.mit.edu/courses/python/?tracking=1",
            title: "Programming in Python",
          },
          {
            type: "url_citation",
            start_index: first.length + 8,
            url: "https://www.cs.cmu.edu/~15122/",
            title: "Imperative computation",
          },
          {
            type: "url_citation",
            start_index: 12,
            url: "https://ocw.mit.edu.example.org/report",
            title: "Untrusted",
          },
        ],
      },
    ],
  } as unknown as OpenAI.Responses.ResponseOutputItem;
  expect(citationsFromSearch([message])).toEqual([]);
  expect(
    citationsFromSearch([
      {
        id: "call",
        type: "web_search_call",
        status: "completed",
        action: { type: "search" },
      },
      message,
    ]),
  ).toEqual([
    expect.objectContaining({
      url: "https://ocw.mit.edu/courses/python/",
      text: first,
    }),
    expect.objectContaining({
      url: "https://www.cs.cmu.edu/~15122/",
      text: second,
    }),
  ]);
});
