function unavailableResponse(status = 503) {
  return new Response(JSON.stringify({ status: "temporarily_unavailable" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Converts transport failures and non-JSON gateway errors into the same safe,
 * non-OK response shape used by product mutation handlers.
 */
export async function safeMutationFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(input, init);
    if (response.ok || response.status === 204) return response;
    try {
      await response.clone().json();
      return response;
    } catch {
      return unavailableResponse(response.status >= 400 && response.status <= 599 ? response.status : 503);
    }
  } catch {
    return unavailableResponse();
  }
}
