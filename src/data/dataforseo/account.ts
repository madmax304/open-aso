import { DataForSeoClient } from "./client.js";

interface UserData {
  login?: string;
  money?: { balance?: number };
}

/** Check credentials and fetch the account balance (a free call). Throws DataForSeoError on bad credentials. */
export async function getAccountBalance(client: DataForSeoClient): Promise<{ balanceUsd: number | null }> {
  const { result } = await client.live<UserData>("/v3/appendix/user_data");
  return { balanceUsd: result?.money?.balance ?? null };
}
