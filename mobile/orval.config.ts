import { defineConfig } from "orval";

export default defineConfig({
    yellowbook: {
        input: {
            target: "./openapi.yaml",
        },
        output: {
            mode: "tags-split",
            client: "react-query",
            httpClient: "fetch",
            target: "./src/api/generated/index.ts",
            schemas: "./src/api/generated/model",
            clean: true,
            override: {
                mutator: {
                    path: "./src/api/customFetch.ts",
                    name: "customFetch",
                },
            },
        },
    },
});
