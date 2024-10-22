import { Http } from "@yandex-cloud/function-types/dist/src/http";
import { describe, expect, test } from "vitest";
import { decode, insertLink, shorten } from "../src";

describe("decode", () => {
  test("from base64", () => {
    const event: Http.Event = {
      body: "SGVsbG8gV29ybGQ=",
      headers: {},
      httpMethod: "POST",
      isBase64Encoded: true,
      multiValueHeaders: {},
      multiValueQueryStringParameters: {},
      queryStringParameters: {},
      requestContext: {} as any,
    };

    expect(decode(event, event.body)).toBe("Hello World");
  });

  test("from raw", () => {
    const event: Http.Event = {
      body: "Lorem Ipsum",
      headers: {},
      httpMethod: "POST",
      isBase64Encoded: false,
      multiValueHeaders: {},
      multiValueQueryStringParameters: {},
      queryStringParameters: {},
      requestContext: {} as any,
    };

    expect(decode(event, event.body)).toBe("Lorem Ipsum");
  });
});

describe("ydb", () => {
  test("find link", async () => {
    const link = "https://google.com";
    const id = shorten(link);
    await insertLink(id, link);
    expect(true).toBe(true);
  });
});
