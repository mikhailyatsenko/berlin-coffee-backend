export const FROM_EMAIL = "support@3welle.com";
export const FROM_NAME = "3 Welle";
export const CUSTOMER_MESSAGE_SUBJECT = "Thank you for contacting 3 Welle";
export const CUSTOMER_MESSAGE_HTML = `
  <p>{{name}}, thank you for contacting 3 Welle!</p>
  <p>We will get back to you as soon as possible.</p>
`;
export const CUSTOMER_MESSAGE_TEXT = `
{{name}}, thank you for contacting 3 Welle!<br />
We will get back to you as soon as possible.
`;

export const ADMIN_EMAIL = "misha.ggg@gmail.com";
export const ADMIN_MESSAGE_SUBJECT = "New contact form submission";
export const ADMIN_MESSAGE_HTML = `
  <p>New contact form submission</p>
  <p>Name: {{name}}</p>
  <p>Email: {{email}}</p>
  <p>Message: {{message}}</p>
`;
export const ADMIN_MESSAGE_TEXT = `
  New contact form submission
  Name: {{name}}
  Email: {{email}}
  Message: {{message}}
`;
