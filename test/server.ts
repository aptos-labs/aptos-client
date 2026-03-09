/**
 * Test servers for HTTP/1.1 and HTTP/2.
 * The H2 server uses allowHTTP1 so clients that can't negotiate h2 fall back to h1.1.
 * Each response includes an x-http-version header so tests can verify the protocol used.
 */
import { Buffer } from "node:buffer";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createSecureServer, type Http2ServerRequest, type Http2ServerResponse } from "node:http2";

// Pre-generated self-signed cert for localhost (valid 10 years, test-only)
const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDv/g9MAABv9yRl
dTUEoX04fyuGt7C05FKWW1fEnjLvvLX6kG0aKvmZ96bqgnzREOXPPqzz2Qv5mEJp
4CNEWTVO+g47mC9NlAGmSjiMgHVcflt/Ap8lpVKvE+uArOFNVOyto03bX0kUv2JN
R89NKWTqNN6TBzEL8vdev6udHN7cNIrrgCbk0i72K5uGShhfTq8kkTbxzZHZ5PlX
/3T7LEX0ylQfii2VqZZGPCN3DVrf0jqUJt33htcLl+IHeF5wJxlYD5OiCQHCVyL2
vg20rAnisMYmyxWnCphfxqt2CcePISSX3IFhjgcrQ2YtE2rqSWLMqY2CX+Yuk6yH
qqjkBbcHAgMBAAECggEAGps+U5JVz2lFMLZWIrr16KiN88kznv+yeZbg28cfezKf
COCwJ8wx5d7t3hE0s0eTTW7zul5gFH4hMXRhlIyV+2PU5h3QyLdVmND2WfqiiEGT
So5zhGHtZm7n7K5olVaKnWl9vTS1eRu1Uz9YfS55+058ioJWmVjeEd61W51oG7Nv
OkI++Xv311fL+o54Ru20X5rjxhT80B+XMMKHeMoKFAgsd4pJVP+31JdhgmQg21Ot
g7ayurFxHN0Q2UNLEiCxcCMTsAa1gbiMtQ/WXvZZtzxs5KMxSlLvR+6QN7yBEQMT
SxsgyknpCTL+EoYZOroLhaFUiTSDtHs0PfTsRYNheQKBgQD+XmJF/N3RC6lQc/tE
VuNImDh5RLt/DbNbSETXoglImvWK4G0mFMRcMZgXSybL8poI354BPUXT6C06fOcG
EXtdvqeiAsU/Cin/pHyXnrkzR64f+MIJ7U5Eo1E3S4ATTzqvxDtc20YVKZaxBMPi
6zPktCaXKvTIdBV1xjc0JdwpKwKBgQDxiBLCgio6fqV1F+35rCdOQs23hdcASLWC
8TbaofumQtyCIWhsW3ORPTkhtSaO8iIqqATb+U4vWLU7X1eVppeYGdQMboWVNIcQ
ZwlUZauAGLuWxL2iqZQmiQ69pHVDclzDFlMgRR67vfQYJbuIY+EdMIvn6W1cz0LL
l04Zh5LDlQKBgQD2s//INWnFN/Qs7XADZenmHIyZQQpAPb94hu0N3j/2xSPkX6o8
xuNzLz59SQwFvfObK5aJSS4SShqjoURHZGksEJ9wyBMaAvec06FrRCwHCjxdEdzP
1/KTK3q3kGhVUgBvPHj+pESifcWDRkXeLZQU+ox7DNSAHeY6ZdZgo1+WJQKBgGOk
jIC8LGm3Z9EXzzCKiiiqPK4yxBE07dUYaFXoL6ZWvRveZnMVg2buyAwU7NRaJihM
6rxJbKzxvsrAuaRedvnj5ew/CFMWuYXVzC6KRydwjKtVfRqHNTx0nKU2HL53hrdh
FWghu90eL35qyqQo+G0PYxiI33pDcz4ErM6xdKXFAoGBAITzQHhTtUMExbxA29W/
8H279+RxK1y7ROGaSQeQAHf4D3EXLaFHa3pIG1F2UXfMPAQ4ujTQxhWCvgXwqA/o
/SARAvxwKScxIyY4OEPi16O5R5KWBbiA/clY4j4st8Or4FBHezdn3O4FzRcQL0g0
lFfVVWbjpvUR3S5JoIrsQyNB
-----END PRIVATE KEY-----`;

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUSDNher7zHqhCh0CRMUwaraSOX3IwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDMwODIxNDEyN1oXDTM2MDMw
NTIxNDEyN1owFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEA7/4PTAAAb/ckZXU1BKF9OH8rhrewtORSlltXxJ4y77y1
+pBtGir5mfem6oJ80RDlzz6s89kL+ZhCaeAjRFk1TvoOO5gvTZQBpko4jIB1XH5b
fwKfJaVSrxPrgKzhTVTsraNN219JFL9iTUfPTSlk6jTekwcxC/L3Xr+rnRze3DSK
64Am5NIu9iubhkoYX06vJJE28c2R2eT5V/90+yxF9MpUH4otlamWRjwjdw1a39I6
lCbd94bXC5fiB3hecCcZWA+TogkBwlci9r4NtKwJ4rDGJssVpwqYX8ardgnHjyEk
l9yBYY4HK0NmLRNq6klizKmNgl/mLpOsh6qo5AW3BwIDAQABo1MwUTAdBgNVHQ4E
FgQU1snvkRPdVnH4PT9ml9y/dmXi0x4wHwYDVR0jBBgwFoAU1snvkRPdVnH4PT9m
l9y/dmXi0x4wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAo2Nq
FPNmN7n3LtjbNP+JTUudz/VTrJTqD49c9Yt9Et8G9znv7Vp2FHZ0l240oom1RQGW
uTO5E/P4Q1nITWaW4NmHWIgB9HV2y0oBRQuraf7WnCDHtGj2ihS8ieRAsIqUnCSR
eLjxNDU6JA8nw1xX9SZnNMz1uXwLT/VG7A61HoHcisrHkBPPBy/bzBKcrV+Fnemu
AYvdcUym1KszsWgU8et2uC5oMh6CTXGkpx78xtYJ1+BjLLjyCo2cC5VQ5IENWP+0
jgnEKMP8IaqptxPUwKBUmqOTr28pAJQVRvuoGtxXevDe7JZjd/PeybD9yIAI64gJ
D8gwlS1SVgFIR6gX+A==
-----END CERTIFICATE-----`;

type Req = IncomingMessage | Http2ServerRequest;
type Res = ServerResponse | Http2ServerResponse;

function handler(req: Req, res: Res) {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const parsedUrl = new URL(req.url!, `http://localhost`);
    const httpVersion = req.httpVersion; // "2.0" or "1.1"

    res.setHeader("x-http-version", httpVersion);

    if (parsedUrl.pathname === "/set-cookie") {
      res.setHeader("content-type", "application/json");
      res.setHeader("set-cookie", "test=value123; Path=/");
      res.writeHead(200);
      res.end(JSON.stringify({ cookie: "set" }));
      return;
    }

    if (parsedUrl.pathname === "/get-cookie") {
      res.setHeader("content-type", "application/json");
      const cookie = req.headers.cookie || "";
      res.writeHead(200);
      res.end(JSON.stringify({ cookie }));
      return;
    }

    if (parsedUrl.pathname === "/json") {
      res.setHeader("content-type", "application/json");
      if (req.method === "GET") {
        const ledger = parsedUrl.searchParams.get("ledger_version");
        res.writeHead(200);
        res.end(JSON.stringify({ hello: "world", ledger_version: ledger }));
        return;
      }
      if (req.method === "POST") {
        const parsed = JSON.parse(body.toString());
        res.writeHead(200);
        res.end(JSON.stringify({ echoed: parsed }));
        return;
      }
    }

    if (parsedUrl.pathname === "/bcs") {
      res.setHeader("content-type", "application/x-bcs");
      res.writeHead(200);
      res.end(Buffer.from([0xde, 0xad, 0xbe, 0xef]));
      return;
    }

    if (parsedUrl.pathname === "/error") {
      res.setHeader("content-type", "application/json");
      res.writeHead(400);
      res.end(JSON.stringify({ error: "bad request" }));
      return;
    }

    res.setHeader("content-type", "application/json");
    res.writeHead(404);
    res.end(JSON.stringify({ error: "not found" }));
  });
}

export interface TestServer {
  url: string;
  close: () => void;
}

export function startH1Server(): Promise<TestServer> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()!;
      const port = typeof addr === "string" ? addr : addr.port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => server.close(),
      });
    });
  });
}

export function startH2Server(): Promise<TestServer> {
  return new Promise((resolve) => {
    const server = createSecureServer({ key: TEST_KEY, cert: TEST_CERT, allowHTTP1: true }, handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()!;
      const port = typeof addr === "string" ? addr : addr.port;
      resolve({
        url: `https://127.0.0.1:${port}`,
        close: () => server.close(),
      });
    });
  });
}

/**
 * CLI mode: start both servers and print URLs to stdout (for Deno/Bun integration tests).
 * Usage: node --import tsx/esm test/server.ts
 */
if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  Promise.all([startH1Server(), startH2Server()]).then(([h1, h2]) => {
    console.log(JSON.stringify({ h1: h1.url, h2: h2.url }));
    // Keep alive until killed
    process.on("SIGTERM", () => {
      h1.close();
      h2.close();
      process.exit(0);
    });
  });
}
