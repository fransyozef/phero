import { parseClientCommand, parseServerCommand } from "./commands"

describe("parseServerCommand", () => {
  describe("serve", () => {
    test("serve", () => {
      expect(parseServerCommand(["serve"])).toEqual({
        name: "serve",
        port: 3030,
        quiet: false,
      })
    })

    test("serve --quiet", () => {
      expect(parseServerCommand(["serve", "--quiet"])).toEqual({
        name: "serve",
        port: 3030,
        quiet: true,
      })
    })

    test("serve -p 1234", () => {
      expect(parseServerCommand(["serve", "-p", "1234"])).toEqual({
        name: "serve",
        port: 1234,
        quiet: false,
      })
    })

    test("serve --port 1234", () => {
      expect(parseServerCommand(["serve", "--port", "1234"])).toEqual({
        name: "serve",
        port: 1234,
        quiet: false,
      })
    })
  })

  describe("build", () => {
    test("build", () => {
      expect(parseServerCommand(["build"])).toEqual({ name: "build" })
    })
  })
})

describe("parseClientCommand", () => {
  describe("watch", () => {
    test("watch", () => {
      expect(parseClientCommand(["watch"])).toEqual({
        name: "watch",
        port: 4040,
        server: { url: "http://localhost:3030" },
        quiet: false,
      })
    })

    test("watch --quiet", () => {
      expect(parseClientCommand(["watch", "--quiet"])).toEqual({
        name: "watch",
        port: 4040,
        server: { url: "http://localhost:3030" },
        quiet: true,
      })
    })

    test("watch http://localhost:1234", () => {
      expect(parseClientCommand(["watch", "http://localhost:1234"])).toEqual({
        name: "watch",
        port: 4040,
        server: { url: "http://localhost:1234" },
        quiet: false,
      })
    })

    test("watch -p 1234", () => {
      expect(parseClientCommand(["watch", "-p", "1234"])).toEqual({
        name: "watch",
        port: 1234,
        server: { url: "http://localhost:3030" },
        quiet: false,
      })
    })

    test("watch --port 1234", () => {
      expect(parseClientCommand(["watch", "--port", "1234"])).toEqual({
        name: "watch",
        port: 1234,
        server: { url: "http://localhost:3030" },
        quiet: false,
      })
    })

    test("watch http://localhost:1234 -p 1234", () => {
      expect(
        parseClientCommand(["watch", "http://localhost:1234", "-p", "4444"]),
      ).toEqual({
        name: "watch",
        port: 4444,
        server: { url: "http://localhost:1234" },
        quiet: false,
      })
    })
  })

  describe("build", () => {
    test("build", () => {
      expect(parseClientCommand(["build"])).toEqual({
        name: "build",
        server: { url: "http://localhost:3030" },
      })
    })

    test("build http://localhost:1234", () => {
      expect(parseClientCommand(["build", "http://localhost:1234"])).toEqual({
        name: "build",
        server: { url: "http://localhost:1234" },
      })
    })

    test("build ../server", () => {
      expect(parseClientCommand(["build", "../server"])).toEqual({
        name: "build",
        server: { path: "../server" },
      })
    })
  })
})
