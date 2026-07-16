export const flowbotEditorFieldLimits = Object.freeze({
  title: Object.freeze({ minLength: 1, maxLength: 160 }),
  localizedText: Object.freeze({ maxLength: 10_000 }),
});

export const flowbotEditorFieldConstraints = Object.freeze({
  title: Object.freeze({
    minLength: flowbotEditorFieldLimits.title.minLength,
    maxLength: flowbotEditorFieldLimits.title.maxLength,
  }),
  localizedText: Object.freeze({ maxLength: flowbotEditorFieldLimits.localizedText.maxLength }),
});
