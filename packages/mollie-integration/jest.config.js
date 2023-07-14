module.exports = {
    displayName: "mollie-integration",
    preset: "../../jest.preset.js",
    globals: {
        "ts-jest": {
            tsconfig: "mollie-integration/tsconfig.spec.json",
            diagnostics: false,
        },
    },
    setupFilesAfterEnv: ["../../jest-setup.js"],
    coverageDirectory: "../../coverage/packages/mollie-integration",
};
