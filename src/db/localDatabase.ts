import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { hashPassword } from "../lib/crypto";
import type { DashboardStats, LoginInput, PublicUser, SignupInput } from "../types";

const idbName = "GoXPlanLocalSql";
const idbStore = "database";
const idbKey = "main";
const sessionKey = "goxplan.session.userId";

let sqlPromise: Promise<SqlJsStatic> | undefined;

type StoredUser = PublicUser & {
  passwordHash: string;
  passwordSalt: string;
};

export async function openDatabase() {
  const SQL = await getSql();
  const bytes = await readDatabaseBytes();
  const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  db.run(schema);
  await saveDatabase(db);
  return db;
}

export async function saveDatabase(db: Database) {
  await writeDatabaseBytes(db.export());
}

export function getSessionUserId() {
  return localStorage.getItem(sessionKey);
}

export function setSessionUserId(userId: string) {
  localStorage.setItem(sessionKey, userId);
}

export function clearSessionUserId() {
  localStorage.removeItem(sessionKey);
}

export async function resetLocalDatabase() {
  clearSessionUserId();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(idbName);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

export function findUserById(db: Database, userId: string) {
  return firstUser(
    db.exec(
      `
        SELECT id, first_name, last_name, username, email, password_hash, password_salt, created_at, updated_at
        FROM users
        WHERE id = ?
      `,
      [userId],
    ),
  );
}

export function findUserByLogin(db: Database, login: string) {
  const cleanLogin = login.trim().toLowerCase();
  return firstUser(
    db.exec(
      `
        SELECT id, first_name, last_name, username, email, password_hash, password_salt, created_at, updated_at
        FROM users
        WHERE lower(username) = ? OR lower(email) = ?
      `,
      [cleanLogin, cleanLogin],
    ),
  );
}

export async function upsertUser(db: Database, input: SignupInput) {
  const username = input.username.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  const existing = findUserByLogin(db, username) ?? findUserByLogin(db, email);
  const now = new Date().toISOString();
  const password = await hashPassword(input.password, existing?.passwordSalt);
  const userId = existing?.id ?? crypto.randomUUID();

  db.run(
    `
      INSERT INTO users (
        id, first_name, last_name, username, email, password_hash, password_salt, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        username = excluded.username,
        email = excluded.email,
        password_hash = excluded.password_hash,
        password_salt = excluded.password_salt,
        updated_at = excluded.updated_at
    `,
    [
      userId,
      input.firstName.trim(),
      input.lastName.trim(),
      username,
      email,
      password.hash,
      password.salt,
      existing?.createdAt ?? now,
      now,
    ],
  );

  await saveDatabase(db);
  return toPublicUser(findUserById(db, userId)!);
}

export async function loginUser(db: Database, input: LoginInput) {
  const user = findUserByLogin(db, input.login);
  if (!user) throw new Error("No account matches that username or email.");

  const password = await hashPassword(input.password, user.passwordSalt);
  if (password.hash !== user.passwordHash) {
    throw new Error("Password is incorrect.");
  }

  return toPublicUser(user);
}

export function getDashboardStats(db: Database, userId: string): DashboardStats {
  const result = db.exec(
    `
      SELECT
        (SELECT COUNT(*) FROM debts WHERE user_id = ?) AS debts,
        (SELECT COUNT(*) FROM income WHERE user_id = ?) AS income,
        (SELECT COUNT(*) FROM payments WHERE user_id = ?) AS payments
    `,
    [userId, userId, userId],
  );
  const row = result[0]?.values[0] ?? [0, 0, 0];
  return { debts: Number(row[0]), income: Number(row[1]), payments: Number(row[2]) };
}

function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function firstUser(result: ReturnType<Database["exec"]>): StoredUser | undefined {
  const row = result[0]?.values[0];
  if (!row) return undefined;

  return {
    id: String(row[0]),
    firstName: String(row[1]),
    lastName: String(row[2]),
    username: String(row[3]),
    email: String(row[4]),
    passwordHash: String(row[5]),
    passwordSalt: String(row[6]),
    createdAt: String(row[7]),
    updatedAt: String(row[8]),
  };
}

async function getSql() {
  sqlPromise ??= initSqlJs({ locateFile: () => wasmUrl });
  return sqlPromise;
}

async function openStore(mode: IDBTransactionMode) {
  const request = indexedDB.open(idbName, 1);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onupgradeneeded = () => request.result.createObjectStore(idbStore);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database.transaction(idbStore, mode).objectStore(idbStore);
}

async function readDatabaseBytes() {
  const store = await openStore("readonly");
  const request = store.get(idbKey);
  return new Promise<Uint8Array | undefined>((resolve, reject) => {
    request.onsuccess = () => {
      const value = request.result as Uint8Array | undefined;
      resolve(value ? new Uint8Array(value) : undefined);
    };
    request.onerror = () => reject(request.error);
  });
}

async function writeDatabaseBytes(bytes: Uint8Array) {
  const store = await openStore("readwrite");
  const request = store.put(bytes, idbKey);
  await new Promise<void>((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

const schema = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    creditor_name TEXT NOT NULL,
    balance_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'OPEN',
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS income (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    received_at TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    debt_id TEXT REFERENCES debts(id) ON DELETE SET NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    paid_at TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id);
  CREATE INDEX IF NOT EXISTS idx_income_user ON income(user_id);
  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
`;
