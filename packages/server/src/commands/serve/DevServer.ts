import { ServerDevEventEmitter, ServerCommandServe } from "@samen/dev"
import {
  generateAppDeclarationFile,
  generateRPCProxy,
  ParsedSamenApp,
  parseSamenApp,
} from "@samen/core"
import crypto from "crypto"
import { promises as fs } from "fs"
import http from "http"
import path from "path"
import ts from "typescript"
import WatchProgram from "./WatchProgram"

export interface PrintedClientCode {
  domainSource: string
  baseSamenClientSource: string
  samenClientSource: string
}

interface Headers {
  [header: string]: string | string[] | undefined
}

interface RPCRoutes {
  [name: string]: (request: { headers: Headers; body: any }) => Promise<any>
}

function hasErrorCode(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as any).code === "string"
  )
}

export default class DevServer {
  private readonly server: http.Server
  private readonly program: WatchProgram
  private readonly command: ServerCommandServe
  private readonly projectPath: string
  private readonly eventEmitter: ServerDevEventEmitter

  private routes: RPCRoutes = {}
  private currentClientCodeHash = ""
  private clients: http.ServerResponse[] = []

  constructor(command: ServerCommandServe, projectPath: string) {
    this.command = command
    this.projectPath = projectPath
    this.eventEmitter = new ServerDevEventEmitter()
    this.server = this.startHttpServer()
    this.program = this.startWatch()
  }

  private get manifestPath(): string {
    return path.join(this.projectPath, "samen-manifest.d.ts")
  }

  // TODO should find the output path based on tsconfig
  private get samenExecutionJS(): string {
    return path.join(this.projectPath, "dist", "samen-execution.js")
  }

  private startWatch(): WatchProgram {
    // Start code watch
    this.eventEmitter.emit({ type: "BUILD_PROJECT_START" })
    const program = new WatchProgram(this.projectPath)
    program.onCompileSucceeded(this.codeCompiled.bind(this))
    program.onError(this.codeErrored.bind(this))
    return program
  }

  private startHttpServer(): http.Server {
    this.eventEmitter.emit({ type: "SERVE_INIT" })
    const server = http.createServer()
    server.on("request", this.requestHandler.bind(this))
    server.on("listening", () => {
      this.eventEmitter.emit({ type: "SERVE_READY" })
    })
    server.on("error", (error) => {
      if (hasErrorCode(error) && error.code === "EADDRINUSE") {
        throw new Error(`Port ${this.command.port} is already in use`)
      } else {
        throw error
      }
    })
    server.listen(this.command.port)
    return server
  }

  private async codeCompiled(
    samenSourceFile: ts.SourceFile,
    typeChecker: ts.TypeChecker,
  ): Promise<void> {
    this.eventEmitter.emit({ type: "BUILD_PROJECT_SUCCESS" })

    let app: ParsedSamenApp
    try {
      this.eventEmitter.emit({ type: "BUILD_MANIFEST_START" })
      app = parseSamenApp(samenSourceFile, typeChecker)
      const dts = generateAppDeclarationFile(app, typeChecker)
      await fs.writeFile(this.manifestPath, dts)
      this.eventEmitter.emit({ type: "BUILD_MANIFEST_SUCCESS" })
    } catch (error) {
      console.error(error)
      this.eventEmitter.emit({
        type: "BUILD_MANIFEST_FAILED",
        error: "TODO",
      })
      return
    }

    try {
      this.eventEmitter.emit({ type: "BUILD_RPCS_START" })
      this.routes = this.generateRoutes(app)
      const output = generateRPCProxy(app, typeChecker)
      await fs.writeFile(this.samenExecutionJS, output.js)
      this.clearRequireCache()

      this.eventEmitter.emit({ type: "BUILD_RPCS_SUCCESS" })
    } catch (error) {
      console.error(error)
      this.eventEmitter.emit({
        type: "BUILD_RPCS_FAILED",
        error: "TODO",
      })
      return
    }
  }

  private codeErrored(diagnostics: readonly ts.Diagnostic[]) {
    this.eventEmitter.emit({ type: "BUILD_PROJECT_FAILED", error: "TODO" })
  }

  private async requestHandler(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST")
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization")

    const startTime = Date.now()

    if (req.method === "OPTIONS") {
      res.statusCode = 200
      res.end()
      return
    }

    if (this.eventEmitter.shouldRegisterListener(req)) {
      return this.eventEmitter.registerListener(res)
    }

    if (req.method === "GET") {
      if (req.url === "/manifest") {
        res.statusCode = 200
        res.write(await fs.readFile(this.manifestPath, "utf-8"))
        res.end()
        return
      }
    }

    this.eventEmitter.emit({ type: "RPC_START", url: req.url })

    if (req.method === "POST") {
      res.setHeader("Content-Type", "application/json")

      if (req.url) {
        const route = this.routes[req.url]
        if (route) {
          try {
            const { headers } = req
            const body = await readBody(req)
            const rpcResult = await route({ headers, body })

            res.statusCode = rpcResult.status

            if (rpcResult.status === 200) {
              res.write(JSON.stringify(rpcResult.result))
              this.eventEmitter.emit({
                type: "RPC_SUCCESS",
                url: req.url,
                status: res.statusCode,
                ms: Date.now() - startTime,
              })
            } else if (rpcResult.status === 400) {
              res.write(JSON.stringify(rpcResult.errors, null, 4))
              this.eventEmitter.emit({
                type: "RPC_FAILED",
                url: req.url,
                status: res.statusCode,
                message: JSON.stringify(rpcResult.errors),
                ms: Date.now() - startTime,
              })
            } else if (rpcResult.status === 500) {
              res.write(JSON.stringify(rpcResult.error))
              console.error(rpcResult.error)
              this.eventEmitter.emit({
                type: "RPC_FAILED",
                url: req.url,
                status: res.statusCode,
                message: rpcResult.error,
                ms: Date.now() - startTime,
              })
            } else {
              throw new Error("Unsupported http status")
            }
          } catch (e: any) {
            // Indicates a bug in Samen
            res.statusCode = 500
            console.error(e)
            res.write(JSON.stringify({ error: e.message }))
            this.eventEmitter.emit({
              type: "RPC_FAILED",
              url: req.url,
              status: 500,
              message: JSON.stringify({ error: e.message }),
              ms: Date.now() - startTime,
            })
          } finally {
            res.end()
            return
          }
        }
      }
    }

    res.statusCode = 404
    res.write(`{ "error": "RPC not found" }`)
    res.end()
    this.eventEmitter.emit({
      type: "RPC_FAILED",
      url: req.url,
      status: 404,
      message: "RPC not found",
      ms: Date.now() - startTime,
    })
  }

  private generateRoutes(app: ParsedSamenApp): RPCRoutes {
    const routes: RPCRoutes = {}
    for (const service of app.services) {
      for (const func of service.funcs) {
        routes[`/${service.name}/${func.name}`] = async (input: any) => {
          const api = require(this.samenExecutionJS)
          return api[`rpc_executor_${service.name}__${func.name}`](input.body)
        }
      }
    }
    return routes
  }

  // TODO: Make this more exact?
  private clearRequireCache() {
    Object.keys(require.cache).forEach((key) => {
      delete require.cache[key]
    })
  }
}

function readBody(request: http.IncomingMessage): Promise<object> {
  return new Promise<object>((resolve, reject) => {
    const chunks: Buffer[] = []
    request
      .on("data", (chunk: Buffer) => {
        chunks.push(chunk)
      })
      .on("end", () => {
        const bodyString = Buffer.concat(chunks).toString()
        resolve(bodyString === "" ? {} : JSON.parse(bodyString))
      })
      .on("error", (err: Error) => {
        reject(err)
      })
  })
}

function computeClientCodeHash(clientCode: PrintedClientCode): string {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(clientCode))
    .digest("base64")
}
