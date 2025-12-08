import { AptosClientRequest, AptosClientResponse } from "./types";

/**
 * Used for JSON responses
 *
 * @param options
 */
export default async function aptosClient<Res>(
  options: AptosClientRequest
): Promise<AptosClientResponse<Res>> {
  return jsonRequest<Res>(options);
}

export async function jsonRequest<Res>(
  options: AptosClientRequest
): Promise<AptosClientResponse<Res>> {
  const { requestUrl, requestConfig } = buildRequest(options);

  const res = await fetch(requestUrl, requestConfig);
  const data = await res.json();

  return {
    status: res.status,
    statusText: res.statusText,
    data,
    headers: res.headers,
    config: requestConfig,
  };
}

/**
 * Used for binary responses, such as BCS outputs
 *
 * @experimental
 * @param options
 */
export async function bcsRequest(
  options: AptosClientRequest
): Promise<AptosClientResponse<ArrayBuffer>> {
  const { requestUrl, requestConfig } = buildRequest(options);

  const res = await fetch(requestUrl, requestConfig);
  const data = await res.arrayBuffer();

  return {
    status: res.status,
    statusText: res.statusText,
    data,
    headers: res.headers,
    config: requestConfig,
  };
}

function buildRequest(options: AptosClientRequest) {
  const headers = new Headers();
  Object.entries(options?.headers ?? {}).forEach(([key, value]) => {
    headers.append(key, String(value));
  });

  const body =
    options.body instanceof Uint8Array
      ? options.body
      : JSON.stringify(options.body);

  const withCredentialsOption = options.overrides?.WITH_CREDENTIALS;
  let credentials: RequestCredentials;
  if (withCredentialsOption === false) {
    credentials = "omit";
  } else if (withCredentialsOption === true) {
    credentials = "include";
  } else {
    credentials = withCredentialsOption ?? "include";
  }

  const requestConfig: RequestInit = {
    method: options.method,
    headers,
    body,
    credentials,
  };

  const params = new URLSearchParams();
  Object.entries(options.params ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      params.append(key, String(value));
    }
  });

  const requestUrl =
    options.url + (params.size > 0 ? `?${params.toString()}` : "");

  return { requestUrl, requestConfig };
}
