import { Handler } from "@yandex-cloud/function-types";
import { Http } from "@yandex-cloud/function-types/dist/src/http";
import { SHA256, enc } from "crypto-js";
import { Driver, getCredentialsFromEnv } from "ydb-sdk";
import { Link } from "./data-helpers";

export function decode(event: Http.Event, body: Http.Event["body"]) {
  if (event.isBase64Encoded) {
    return Buffer.from(body, "base64").toString();
  }
  return body;
}

export function shorten(link: string) {
  return SHA256(link).toString(enc.Hex).slice(0, 6);
}

async function getDriver() {
  const driver = new Driver({
    authService: getCredentialsFromEnv(),
    endpoint: process.env.endpoint,
    database: process.env.database,
  });

  if (!(await driver.ready(5000))) {
    throw new Error("Driver connection timeout");
  }

  return driver;
}

export async function insertLink(id: string, link: string) {
  const driver = await getDriver();

  await driver.tableClient.withSession(async (session) => {
    await session
      .executeQuery(
        ` INSERT INTO links (id, link)
          VALUES ('${id}', '${link}')
        `,
      )
      .catch(ignoreError("Conflict with existing key"));
  });

  driver.destroy();
}

const ignoreError = (message: string) => (error: unknown) => {
  if (error instanceof Error && error.message.toLowerCase().includes(message.toLowerCase())) {
    return;
  }
  throw error;
};

export async function findLink(id: string) {
  const driver = await getDriver();

  const link = await driver.tableClient.withSession(async (session) => {
    const { resultSets } = await session.executeQuery(`
      SELECT * FROM links
      WHERE id = '${id}'
    `);

    const ret = Link.createNativeObjects(resultSets[0]!) as Link[];

    return ret[0]?.link;
  });

  driver.destroy();
  return link;
}

async function getResult(url: string, event: Http.Event): Promise<Http.Result> {
  if (url == "/shorten") {
    const link = event.body;
    const originalHost = event.headers["Origin"];
    if (!link) return { statusCode: 400, body: "Отсутствует body" };
    if (!originalHost) return { statusCode: 400, body: "Отсутствует event.headers.Origin" };

    const id = shorten(link);
    await insertLink(id, link);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${originalHost}/r/${id}` }),
    };
  }

  if (url.startsWith("/r/")) {
    const linkId: string = (event as any).params.id;
    const redirectTo = await findLink(linkId);
    if (!redirectTo) return { statusCode: 404, body: "Такой ссылки не существует" };

    return {
      statusCode: 302,
      headers: { "Location": redirectTo },
    };
  }

  return {
    statusCode: 404,
    body: "Данного пути не существует",
  };
}

export const handler: Handler.Http = async (event, context) => {
  if ("url" in event && typeof event.url == "string") {
    let url = event.url;
    if (url.endsWith("?")) {
      url = url.slice(0, -1);
    }
    return await getResult(url, event);
  }

  return {
    statusCode: 404,
    body: "Эту функцию следует вызывать при помощи api-gateway",
  };
};
