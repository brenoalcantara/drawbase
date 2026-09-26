import type { ZodIssue } from 'zod';

export type FormattedValidationIssue = {
  code: string;
  message: string;
  path: Array<string | number>;
};

export function formatZodIssues(issues: ZodIssue[]): FormattedValidationIssue[] {
  return issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.map((segment) => (typeof segment === 'symbol' ? segment.toString() : segment)),
  }));
}
