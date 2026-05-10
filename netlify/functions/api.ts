import serverless from "serverless-http";
import { createExpressApp } from "../../server";

let app: any;

export const handler = async (event: any, context: any) => {
  if (!app) {
    app = await createExpressApp();
  }
  const handlerFunc = serverless(app);
  return handlerFunc(event, context);
};
