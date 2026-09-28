/** Escape HTML special characters to prevent XSS in emails. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function emailTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="padding:32px 40px;border-bottom:1px solid #e4e4e7">
      <h1 style="margin:0;font-size:20px;color:#18181b">PaperForge</h1>
    </div>
    <div style="padding:32px 40px">
      <h2 style="margin:0 0 16px;font-size:18px;color:#18181b">${escapeHtml(title)}</h2>
      ${body}
    </div>
    <div style="padding:24px 40px;background:#fafafa;text-align:center;font-size:12px;color:#71717a">
      PaperForge — LaTeX editing, reimagined
    </div>
  </div>
</body>
</html>`;
}

export function buttonHtml(text: string, url: string): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;background:#18181b;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;margin:16px 0">${escapeHtml(text)}</a>`;
}

export function welcomeEmailTemplate(input: {
  name: string;
  projectsUrl: string;
  templatesUrl: string;
  docsUrl: string;
}): string {
  const body = `
    <p style="margin:0 0 12px;color:#3f3f46">Hi ${escapeHtml(input.name)},</p>
    <p style="margin:0 0 12px;color:#3f3f46;line-height:1.5">Your email is verified and your account is ready. The fastest way to a compiled document is to start from a template, then edit and compile in the browser.</p>
    ${buttonHtml('Create your first project', input.projectsUrl)}
    <p style="margin:20px 0 8px;color:#18181b;font-weight:600">Quick links</p>
    <ul style="margin:0;padding-left:18px;color:#3f3f46;line-height:1.8">
      <li><a href="${escapeHtml(input.templatesUrl)}" style="color:#2563eb">Browse the template gallery</a> — journals, theses, Beamer, CV</li>
      <li><a href="${escapeHtml(input.docsUrl)}" style="color:#2563eb">Read the getting-started docs</a> — shortcuts, symbols, Git</li>
    </ul>
    <p style="margin:16px 0 0;font-size:13px;color:#71717a">Happy writing — the PaperForge team.</p>
  `;
  return emailTemplate('Welcome to PaperForge', body);
}

export function salesInquiryEmailTemplate(input: {
  requesterEmail: string;
  requesterName: string;
  organizationName: string;
  seats: number;
  timeline: string;
  message?: string | null;
}) {
  const rows = [
    ['Requester', `${input.requesterName} <${input.requesterEmail}>`],
    ['Organization', input.organizationName],
    ['Seats', String(input.seats)],
    ['Timeline', input.timeline],
    ['Message', input.message?.trim() || 'No message provided'],
  ];

  const body = `
    <p style="margin:0 0 16px;color:#3f3f46;line-height:1.5">A Team plan inquiry was submitted from PaperForge.</p>
    <table style="width:100%;border-collapse:collapse">
      ${rows.map(([label, value]) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#71717a;width:140px">${escapeHtml(label)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#18181b">${escapeHtml(value)}</td>
        </tr>
      `).join('')}
    </table>
  `;

  return emailTemplate('Team plan inquiry', body);
}
