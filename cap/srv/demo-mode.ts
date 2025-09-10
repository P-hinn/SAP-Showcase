import cds from '@sap/cds';

/**
 * Demo mode: the switches a presenter needs, and nothing a productive system
 * could ever reach. Everything here is inert unless authentication is mocked.
 */

/** Cookie the UI shell sets when the presenter picks a demo user. */
export const DEMO_USER_COOKIE = 'acme-demo-user';

interface MockedUser {
  roles: string[];
  password?: string;
}

/**
 * Roles of a configured user. Before CAP's mocked authentication starts they
 * are an array; afterwards CAP has replaced the entry with a cds.User whose
 * roles are a map ({ Requester: 1 }). Both shapes are accepted.
 */
function rolesOf(user: unknown): string[] {
  const roles = (user as { roles?: unknown } | null)?.roles;
  if (Array.isArray(roles)) return roles.map(String);
  return roles && typeof roles === 'object' ? Object.keys(roles) : [];
}

/** True only for mocked authentication - never with XSUAA/IAS. */
export function isDemoLandscape(): boolean {
  const auth = (cds.requires as any).auth as { kind?: string } | undefined;
  return auth?.kind === 'mocked' || auth?.kind === 'basic';
}

/** Roles of this application - a mock user holding none of them is not a demo user. */
const APP_ROLES = new Set(['Requester', 'ApproverL1', 'ApproverL2', 'ApproverL3', 'ProcurementAdmin']);

/**
 * The configured mock users (package.json > cds.requires.auth.users), without
 * the generic ones CAP ships by default (alice, bob, ...).
 */
export function demoUsers(): Record<string, MockedUser> {
  // cds.requires, not cds.env.requires: that is the resolved configuration
  // CAP's own mocked authentication reads its users from.
  const auth = (cds.requires as any).auth as { users?: Record<string, unknown> } | undefined;
  const users: Record<string, MockedUser> = {};
  for (const [id, user] of Object.entries(auth?.users ?? {})) {
    const roles = rolesOf(user);
    if (roles.some((role) => APP_ROLES.has(role))) {
      users[id] = { roles: roles.filter((role) => APP_ROLES.has(role)), password: (user as MockedUser).password };
    }
  }
  return users;
}

/** Reads one cookie from a raw Cookie header. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

/**
 * Express middleware: a known demo user in the cookie becomes the Basic
 * credentials of the request. CAP's own mocked authentication then does the
 * actual login, so roles and restrictions behave exactly as with a typed-in
 * password. The browser's cached Basic credentials lose against the cookie -
 * that is what makes switching users a single click.
 */
export function demoUserMiddleware(): (req: any, res: unknown, next: () => void) => void {
  return (req, _res, next) => {
    try {
      const id = readCookie(req.headers?.cookie, DEMO_USER_COOKIE);
      const user = id ? demoUsers()[id] : undefined;
      if (id && user) {
        req.headers.authorization = 'Basic ' + Buffer.from(`${id}:${user.password ?? ''}`).toString('base64');
      }
    } catch {
      // A broken cookie must never take the request down - it just is not a demo login.
    }
    next();
  };
}
