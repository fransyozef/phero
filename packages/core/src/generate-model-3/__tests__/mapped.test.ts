import { generateParserModelMap } from "../../lib/tsTestUtils"

describe("mapped", () => {
  test("MyMappedType keyof 1 key of a literal type", () => {
    const modelMap = generateParserModelMap(`
      type MyMappedType = keyof { kaas: string }
      
      function test(): MyMappedType { throw new Error() }
    `)

    // console.log(JSON.stringify(modelMap, null, 4))
    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyMappedType",
      },
      deps: {
        MyMappedType: {
          type: "string-literal",
          literal: "kaas",
        },
      },
    })
  })
  test("MyMappedType keyof 1 key of an enum", () => {
    const modelMap = generateParserModelMap(`
      enum MyEnum {
        Aap = "aap",
        Noot = "noot",
        Mies = "mies",
      }
      type MyMappedType = keyof typeof MyEnum
      
      function test(): MyMappedType { throw new Error() }
    `)

    // console.log(JSON.stringify(modelMap, null, 4))
    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyMappedType",
      },
      deps: {
        MyMappedType: {
          type: "union",
          oneOf: [
            {
              type: "string-literal",
              literal: "Aap",
            },
            {
              type: "string-literal",
              literal: "Noot",
            },
            {
              type: "string-literal",
              literal: "Mies",
            },
          ],
        },
      },
    })
  })
  test("MyMappedType keyof 1 key of a class", () => {
    const modelMap = generateParserModelMap(`
      class MyClass {
        aap: string
        noot: boolean
        mies: number
      }
      type MyMappedType = keyof MyClass
      
      function test(): MyMappedType { throw new Error() }
    `)

    // console.log(JSON.stringify(modelMap, null, 4))
    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyMappedType",
      },
      deps: {
        MyMappedType: {
          type: "union",
          oneOf: [
            {
              type: "string-literal",
              literal: "aap",
            },
            {
              type: "string-literal",
              literal: "noot",
            },
            {
              type: "string-literal",
              literal: "mies",
            },
          ],
        },
      },
    })
  })
  test("MyMappedType keyof 1 key", () => {
    const modelMap = generateParserModelMap(`
      type Aad = {
        kaas: string
      }

      type MyMappedType = keyof Aad
      
      function test(): MyMappedType { throw new Error() }
    `)

    // console.log(JSON.stringify(modelMap, null, 4))
    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyMappedType",
      },
      deps: {
        MyMappedType: {
          type: "string-literal",
          literal: "kaas",
        },
      },
    })
  })
  test("MyMappedType keyof multiple keys", () => {
    const modelMap = generateParserModelMap(`
      type Aad = {
        kaas: string
        aap: string
      }
      type MyMappedType = keyof Aad
      
      function test(): MyMappedType { throw new Error() }
    `)

    // console.log(JSON.stringify(modelMap, null, 4))
    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyMappedType",
      },
      deps: {
        MyMappedType: {
          type: "union",
          oneOf: [
            {
              type: "string-literal",
              literal: "kaas",
            },
            {
              type: "string-literal",
              literal: "aap",
            },
          ],
        },
      },
    })
  })
  test("MyMappedType keyof as type parameter", () => {
    const modelMap = generateParserModelMap(`
      type Aad = {
        kaas: string
      }
      type Bug<X> = X
      type MyMappedType = Bug<keyof Aad>
      
      function test(): MyMappedType { throw new Error() }
    `)

    // console.log(JSON.stringify(modelMap, null, 4))
    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyMappedType",
      },
      deps: {
        MyMappedType: {
          type: "reference",
          typeName: 'Bug<"kaas">',
          typeArguments: [
            {
              type: "string-literal",
              literal: "kaas",
            },
          ],
        },
        'Bug<"kaas">': {
          type: "generic",
          typeName: 'Bug<"kaas">',
          typeArguments: [
            {
              type: "string-literal",
              literal: "kaas",
            },
          ],
          parser: {
            type: "string-literal",
            literal: "kaas",
          },
        },
      },
    })
  })
  test("MyMappedType keyof as default parameter", () => {
    const modelMap = generateParserModelMap(`
      type Aad = {
          kaas: string
      }
      type Bug<X, Y = keyof X> = {y:Y}
      type MyMappedType = Bug<Aad>
      
      function test(): MyMappedType { throw new Error() }
    `)

    // console.log(JSON.stringify(modelMap, null, 4))
    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyMappedType",
      },
      deps: {
        MyMappedType: {
          type: "reference",
          typeName: "Bug<Aad, keyof X>",
          typeArguments: [
            {
              type: "reference",
              typeName: "Aad",
            },
            {
              type: "string-literal",
              literal: "kaas",
            },
          ],
        },
        Aad: {
          type: "object",
          members: [
            {
              type: "member",
              name: "kaas",
              optional: false,
              parser: {
                type: "string",
              },
            },
          ],
        },
        "Bug<Aad, keyof X>": {
          type: "generic",
          typeName: "Bug<Aad, keyof X>",
          typeArguments: [
            {
              type: "reference",
              typeName: "Aad",
            },
            {
              type: "string-literal",
              literal: "kaas",
            },
          ],
          parser: {
            type: "object",
            members: [
              {
                type: "member",
                name: "y",
                optional: false,
                parser: {
                  type: "string-literal",
                  literal: "kaas",
                },
              },
            ],
          },
        },
      },
    })
  })
  test("Exclude", () => {
    const modelMap = generateParserModelMap(`
      type Aad = {
        kaas: string
        koos: string
      }
      
      type MyMappedType = Exclude<keyof Aad, "koos">
      
      function test(): MyMappedType { throw new Error() }
    `)

    // console.log(JSON.stringify(modelMap, null, 4))
    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyMappedType",
      },
      deps: {
        MyMappedType: {
          type: "reference",
          typeName: 'Exclude<keyof Aad, "koos">',
          typeArguments: [
            {
              type: "union",
              oneOf: [
                {
                  type: "string-literal",
                  literal: "kaas",
                },
                {
                  type: "string-literal",
                  literal: "koos",
                },
              ],
            },
            {
              type: "string-literal",
              literal: "koos",
            },
          ],
        },
        'Exclude<keyof Aad, "koos">': {
          type: "generic",
          typeName: 'Exclude<keyof Aad, "koos">',
          typeArguments: [
            {
              type: "union",
              oneOf: [
                {
                  type: "string-literal",
                  literal: "kaas",
                },
                {
                  type: "string-literal",
                  literal: "koos",
                },
              ],
            },
            {
              type: "string-literal",
              literal: "koos",
            },
          ],
          parser: {
            type: "string-literal",
            literal: "kaas",
          },
        },
      },
    })
  })
  test("Pick", () => {
    const modelMap = generateParserModelMap(`
      type Aad = {
        kaas: string
        koos: string
      }
      
      type MyMappedType = Pick<Aad, "kaas">
      
      function test(): MyMappedType { throw new Error() }
    `)

    // console.log(JSON.stringify(modelMap, null, 4))
    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyMappedType",
      },
      deps: {
        MyMappedType: {
          type: "object",
          members: [
            {
              type: "member",
              name: "kaas",
              optional: false,
              parser: {
                type: "string",
              },
            },
          ],
        },
      },
    })
  })

  test("Omit", () => {
    const modelMap = generateParserModelMap(`
      type Aad = {
        kaas: string
        koos: string
      }
      
      type MyMappedType = Omit<Aad, "koos">
      function test(): MyMappedType { throw new Error() }

    `)

    // console.log(JSON.stringify(modelMap, null, 4))
    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyMappedType",
      },
      deps: {
        MyMappedType: {
          type: "object",
          members: [
            {
              type: "member",
              name: "kaas",
              optional: false,
              parser: {
                type: "string",
              },
            },
          ],
        },
      },
    })
  })

  test("MyMappedType", () => {
    const modelMap = generateParserModelMap(`
      type Aad = {
        a: string
        b: string
      }
      type MyMappedType = Pick<Aad, Exclude<keyof Aad, "b">>;
  
      function test(): MyMappedType { throw new Error() }
    `)

    // console.log(JSON.stringify(modelMap, null, 4))
    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyMappedType",
      },
      deps: {
        MyMappedType: {
          type: "object",
          members: [
            {
              type: "member",
              name: "a",
              optional: false,
              parser: {
                type: "string",
              },
            },
          ],
        },
      },
    })
  })

  test("Pick recursive", () => {
    const modelMap = generateParserModelMap(`
      type Aad = {
        kaas?: Aad
        koos: string
      }
      
      type MyMappedType = Omit<Aad, "koos">
      
      function test(): MyMappedType { throw new Error() }
    `)

    // console.log(JSON.stringify(modelMap, null, 4))
    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyMappedType",
      },
      deps: {
        MyMappedType: {
          type: "object",
          members: [
            {
              type: "member",
              name: "kaas",
              optional: true,
              parser: {
                type: "reference",
                typeName: "Aad",
              },
            },
          ],
        },
        Aad: {
          type: "object",
          members: [
            {
              type: "member",
              name: "kaas",
              optional: true,
              parser: {
                type: "reference",
                typeName: "Aad",
              },
            },
            {
              type: "member",
              name: "koos",
              optional: false,
              parser: {
                type: "string",
              },
            },
          ],
        },
      },
    })
  })

  test("MyMappedType", () => {
    const modelMap = generateParserModelMap(`
      type Aad = {
        a: string
        b: string
      }
      type MyMappedType = {
        [key in keyof Aad]: string | number
      }
  
      function test(): MyMappedType { throw new Error() }
    `)

    // console.log(JSON.stringify(modelMap, null, 4))
    expect(modelMap).toEqual({
      root: {
        type: "reference",
        typeName: "MyMappedType",
      },
      deps: {
        MyMappedType: {
          type: "object",
          members: [
            {
              type: "member",
              name: "a",
              optional: false,
              parser: {
                type: "union",
                oneOf: [{ type: "string" }, { type: "number" }],
              },
            },
            {
              type: "member",
              name: "b",
              optional: false,
              parser: {
                type: "union",
                oneOf: [{ type: "string" }, { type: "number" }],
              },
            },
          ],
        },
      },
    })
  })
})

// MET JASPER:
// // MyDeepConditionalRecursiveType<number>

// const MyDeepConditionalRecursiveType_number_Parser = {
//   prop: Wrap_number_boolean_Parser
// }

// const Wrap_number_boolean_Parser = {
//   w: NumberParser,
//   b: BooleanParser,
//   recursive: MyDeepConditionalRecursiveType_boolean_Parser,
// }

// const MyDeepConditionalRecursiveType_boolean_Parser = {
//   prop: Wrap_boolean_boolean_Parser
// }

// const Wrap_boolean_boolean_Parser = {
//   w: BooleanParser,
//   b: BooleanParser,
//   recursive: MyDeepConditionalRecursiveType_boolean_Parser,
// }

// // MyDeepConditionalRecursiveType<string>

// const MyDeepConditionalRecursiveType_string_Parser = {
//   prop: Wrap_string_number_Parser
// }

// const Wrap_string_number_Parser = {
//   w: StringParser,
//   b: NumberParser,
//   recursive: MyDeepConditionalRecursiveType_number_Parser,
// }
