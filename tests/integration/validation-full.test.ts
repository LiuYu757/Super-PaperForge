import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema, createProjectSchema, updateProjectSchema, inviteMemberSchema, changePasswordSchema, filePathSchema, paginationSchema, searchSchema, BLOCKED_EXTENSIONS, ALLOWED_UPLOAD_TYPES, MAX_FILE_SIZE, MAX_PROJECT_SIZE, MAX_USER_STORAGE } from '@/lib/validation';

describe('validation comprehensive', () => {
  // Register
  it('register accepts valid', () => { expect(registerSchema.safeParse({email:'a@b.com',name:'Jo',password:'Pass1234'}).success).toBe(true); });
  it('register rejects no lowercase', () => { expect(registerSchema.safeParse({email:'a@b.com',name:'T',password:'PASS1234'}).success).toBe(false); });
  it('register 255 char name ok', () => { expect(registerSchema.safeParse({email:'a@b.com',name:'a'.repeat(255),password:'Pass1234'}).success).toBe(true); });

  // Login
  it('login accepts any password', () => { expect(loginSchema.safeParse({email:'a@b.com',password:'x'}).success).toBe(true); });

  // Project
  it('project 255 char name ok', () => { expect(createProjectSchema.safeParse({name:'a'.repeat(255)}).success).toBe(true); });
  it('project xelatex ok', () => { expect(createProjectSchema.safeParse({name:'T',compiler:'xelatex'}).success).toBe(true); });
  it('project lualatex ok', () => { expect(createProjectSchema.safeParse({name:'T',compiler:'lualatex'}).success).toBe(true); });
  it('update archived boolean', () => { expect(updateProjectSchema.safeParse({archived:true}).success).toBe(true); });
  it('update description max 1000', () => { expect(updateProjectSchema.safeParse({description:'a'.repeat(1001)}).success).toBe(false); });

  // Invite
  it('invite editor ok', () => { expect(inviteMemberSchema.safeParse({email:'a@b.com',role:'editor'}).success).toBe(true); });
  it('invite viewer ok', () => { expect(inviteMemberSchema.safeParse({email:'a@b.com',role:'viewer'}).success).toBe(true); });

  // Change password
  it('change password valid', () => { expect(changePasswordSchema.safeParse({currentPassword:'Old1pass',newPassword:'New1pass',confirmPassword:'New1pass'}).success).toBe(true); });

  // File path
  it('file path nested dirs', () => { expect(filePathSchema.safeParse('a/b/c/d.tex').success).toBe(true); });
  it('file path with spaces', () => { expect(filePathSchema.safeParse('my file.tex').success).toBe(true); });
  it('file path 1024 chars ok', () => { expect(filePathSchema.safeParse('a'.repeat(1024)).success).toBe(true); });

  // Pagination
  it('pagination page 1 default', () => { expect(paginationSchema.parse({}).page).toBe(1); });
  it('pagination limit 100 max', () => { expect(paginationSchema.safeParse({limit:100}).success).toBe(true); });
  it('pagination limit 101 fail', () => { expect(paginationSchema.safeParse({limit:101}).success).toBe(false); });
  it('pagination sort name ok', () => { expect(paginationSchema.safeParse({sort:'name'}).success).toBe(true); });
  it('pagination order asc ok', () => { expect(paginationSchema.safeParse({order:'asc'}).success).toBe(true); });

  // Search
  it('search optional query', () => { expect(searchSchema.safeParse({}).success).toBe(true); });
  it('search optional category', () => { expect(searchSchema.safeParse({category:'journal'}).success).toBe(true); });

  // Constants
  it('blocks .js', () => { expect(BLOCKED_EXTENSIONS.has('.js')).toBe(true); });
  it('blocks .jar', () => { expect(BLOCKED_EXTENSIONS.has('.jar')).toBe(true); });
  it('allows text/plain', () => { expect(ALLOWED_UPLOAD_TYPES.has('text/plain')).toBe(true); });
  it('allows image/png', () => { expect(ALLOWED_UPLOAD_TYPES.has('image/png')).toBe(true); });
  it('MAX_PROJECT_SIZE > MAX_FILE_SIZE', () => { expect(MAX_PROJECT_SIZE).toBeGreaterThan(MAX_FILE_SIZE); });
  it('MAX_USER_STORAGE > MAX_PROJECT_SIZE', () => { expect(MAX_USER_STORAGE).toBeGreaterThan(MAX_PROJECT_SIZE); });
});
