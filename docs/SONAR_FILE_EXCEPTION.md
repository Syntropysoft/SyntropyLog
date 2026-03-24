# Sonar: Exception for a Specific File

If in **your project** (a consumer of SyntropyLog) you have a file where you define **your own** sensitive words or aliases (e.g. `mySensitiveKeys.ts` or a masking config with string literals), you can add a Sonar exception for that file so it doesn't block your deploy.

## Option 1: Exclude the File from Analysis

In the `sonar-project.properties` of **your** repo:

```properties
# Exclude the file where you define your aliases/sensitive words from analysis
sonar.exclusions=**/node_modules/**,**/dist/**,**/myFileWithSensitiveWords.ts
```

Or just that file:

```properties
sonar.exclusions=**/config/sensitiveKeys.ts
```

This way Sonar won't analyze that file and won't flag S2068 or other secrets rules there.

## Option 2: Ignore Only Rule S2068 on That File (multicriteria)

If you want the file to still be analyzed but **not have the secrets rule applied** to it:

In `sonar-project.properties` of your project:

```properties
sonar.issue.ignore.multicriteria=e1

# Don't apply S2068 (hardcoded secrets) to the file with your aliases
sonar.issue.ignore.multicriteria.e1.ruleKey=typescript:S2068
sonar.issue.ignore.multicriteria.e1.resourceKey=**/path/to/myFileWithWords.ts
```

For multiple files, add more criteria (e2, e3, …) with the same `ruleKey` and a different `resourceKey`.

## Summary

| Goal | What to use |
|------|-------------|
| Don't analyze the file at all | `sonar.exclusions=**/myFile.ts` |
| Analyze the file but don't flag S2068 there | `sonar.issue.ignore.multicriteria` with `resourceKey` pointing to that file |

The SyntropyLog library already does this internally with `sensitiveKeys.ts`; in your app you can replicate the same pattern for the file where you add **your own** custom words.
