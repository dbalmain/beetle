export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (typeof specifier === "string" && specifier.endsWith(".js")) {
      try {
        return await nextResolve(`${specifier.slice(0, -3)}.ts`, context);
      } catch {
        throw error;
      }
    }
    throw error;
  }
}
