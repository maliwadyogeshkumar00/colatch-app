interface Env {
  DB: { prepare(sql: string): any; batch(stmts: any[]): Promise<any[]> };
  SESSION_SECRET?: string;
  META_ACCESS_TOKEN?: string;
  META_IG_USER_ID?: string;
  META_APP_SECRET?: string;
  META_VERIFY_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  AI_MODEL?: string;
  COLATCH_FEE_PCT?: string;
  AGENCY_MARKUP_PCT?: string;
  MEDIA_CPM?: string;
  [key: string]: any;
}
