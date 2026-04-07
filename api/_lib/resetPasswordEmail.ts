export function applyResetPasswordTemplate(template: string, resetUrl: string, userName?: string): string {
  const greeting = userName ? ` ${userName}` : '';

  return template
    .replace(/\{\{\s*\.ConfirmationURL\s*\}\}/g, resetUrl)
    .replace(/\{\{URL\}\}/g, resetUrl)
    .replace(/\{\{GREETING\}\}/g, greeting);
}

