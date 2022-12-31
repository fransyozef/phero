import { generateParserModelMap } from "../../lib/tsTestUtils"

describe("generics", () => {
  test.only("MyInterface<number>", () => {
    const modelMap = generateParserModelMap(`
      interface MyInterface<T> {
        prop: T
      }
      function test(): MyInterface<number> { throw new Error() }
    `)

    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyInterface",
        typeArguments: [
          {
            type: "number",
          },
        ],
      },
      deps: {
        "MyInterface<T>": {
          type: "object",
          members: [
            {
              type: "member",
              name: "prop",
              optional: false,
              parser: {
                type: "typeParameter",
                name: "T",
                position: 0,
              },
            },
          ],
        },
      },
    })
  })
  test("MyTypeAlias<number>", () => {
    const modelMap = generateParserModelMap(`
      type MyTypeAlias<T> = {
        prop: T
      }
      function test(): MyTypeAlias<number> { throw new Error() }
    `)

    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyTypeAlias",
        typeArguments: [
          {
            type: "number",
          },
        ],
      },
      deps: {
        "MyTypeAlias<T>": {
          type: "object",
          members: [
            {
              type: "member",
              name: "prop",
              optional: false,
              parser: {
                type: "typeParameter",
                name: "T",
                position: 0,
              },
            },
          ],
        },
      },
    })
  })
  test("MyConditionalType<number>", () => {
    const modelMap = generateParserModelMap(`
      type MyConditionalType<T> = T extends string ? {
        prop: number
      } : {
        prop: string
      }
      function test(): MyConditionalType<number> { throw new Error() }
    `)

    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyConditionalType",
        typeArguments: [
          {
            type: "string",
          },
        ],
      },
      deps: {
        "MyConditionalType<T>": {
          type: "object",
          members: [
            {
              type: "member",
              name: "prop",
              optional: false,
              parser: {
                type: "typeParameter",
                name: "T",
                position: 0,
              },
            },
          ],
        },
      },
    })
  })
  test("MyType<number>", () => {
    const modelMap = generateParserModelMap(`
      interface MyType<T> {
        prop: Wrap<T>
      }
      interface Wrap<W> {
        inner: W
      }
      function test(): MyType<number> { throw new Error() }
    `)

    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyType",
        typeArguments: [
          {
            type: "number",
          },
        ],
      },
      deps: {
        "MyType<T>": {
          type: "object",
          members: [
            {
              type: "member",
              name: "prop",
              optional: false,
              parser: {
                type: "reference",
                typeName: "Wrap",
                typeArguments: [
                  {
                    type: "number",
                  },
                ],
              },
            },
          ],
        },
        "Wrap<W>": {
          type: "object",
          members: [
            {
              type: "member",
              name: "inner",
              optional: false,
              parser: {
                type: "typeParameter",
                name: "W",
                position: 0,
              },
            },
          ],
        },
      },
    })
  })
})
