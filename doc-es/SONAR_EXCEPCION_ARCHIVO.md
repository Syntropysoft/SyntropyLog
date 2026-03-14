# Sonar: excepción para un archivo en particular

Si en **tu proyecto** (consumidor de SyntropyLog) tenés un archivo donde definís **tus propias palabras o aliases** sensibles (por ejemplo un `mySensitiveKeys.ts` o un config de masking con literales), podés cargar una excepción en Sonar para ese archivo y que no bloquee el deploy.

## Opción 1: Excluir el archivo del análisis

En el `sonar-project.properties` de **tu** repo:

```properties
# Excluir del análisis el archivo donde definís tus aliases/palabras sensibles
sonar.exclusions=**/node_modules/**,**/dist/**,**/miArchivoConPalabrasSensibles.ts
```

O solo ese archivo:

```properties
sonar.exclusions=**/config/sensitiveKeys.ts
```

Así Sonar no analiza ese archivo y no marcará S2068 ni reglas de secrets ahí.

## Opción 2: Ignorar solo la regla S2068 en ese archivo (multicriteria)

Si preferís que el archivo sí se analice pero que **no se aplique la regla de secrets** en él:

En `sonar-project.properties` de tu proyecto:

```properties
sonar.issue.ignore.multicriteria=e1

# No aplicar S2068 (hardcoded secrets) en el archivo con tus aliases
sonar.issue.ignore.multicriteria.e1.ruleKey=typescript:S2068
sonar.issue.ignore.multicriteria.e1.resourceKey=**/ruta/a/miArchivoConPalabras.ts
```

Para varios archivos, añadís más criterios (e2, e3, …) con el mismo `ruleKey` y distinto `resourceKey`.

## Resumen

| Objetivo | Qué usar |
|----------|----------|
| No analizar el archivo en absoluto | `sonar.exclusions=**/miArchivo.ts` |
| Analizar el archivo pero no marcar S2068 ahí | `sonar.issue.ignore.multicriteria` con `resourceKey` apuntando a ese archivo |

La librería SyntropyLog ya hace esto internamente con `sensitiveKeys.ts`; en tu app podés repetir el mismo patrón para el archivo donde agregás **tus** palabras propias.
