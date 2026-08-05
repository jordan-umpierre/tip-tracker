export type AuthAdmin = {
  deleteIdentity(id: string): Promise<void>;
};

export function createSupabaseAuthAdmin(options: {
  serviceRoleKey: string;
  supabaseUrl: URL;
}): AuthAdmin {
  return {
    async deleteIdentity(id) {
      const url = new URL(`/auth/v1/admin/users/${encodeURIComponent(id)}`, options.supabaseUrl);
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          apikey: options.serviceRoleKey,
          authorization: `Bearer ${options.serviceRoleKey}`,
        },
      });

      // A retry after the provider already deleted the identity is success.
      if (!response.ok && response.status !== 404) {
        throw new Error(`Supabase identity deletion failed with status ${response.status}`);
      }
    },
  };
}
