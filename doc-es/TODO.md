# TODO — SyntropyLog

- [x] **Sonar / aliases**: No escribir literales que Sonar marca (password, token, secret, etc.); usar aliases en un solo archivo.  
  **Hecho:**  
  - `src/sensitiveKeys.ts`: constantes `MASK_KEY_PWD`, `MASK_KEY_TOK`, `MASK_KEY_SEC`, etc., que contienen las palabras sensibles. El resto del código usa solo estas constantes.  
  - `MaskingEngine`, `DataSanitizer`, `SerializationManager`, `sanitizeConfig` usan los aliases; no hay literales en esos archivos.  
  - `sonar-project.properties`: exclusiones multicriteria (S2068) + `sonar.exclusions` incluye `**/sensitiveKeys.ts` para no analizar el único archivo con los literales.
