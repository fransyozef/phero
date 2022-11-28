import ts from "typescript"
import { printCode } from "../lib/tsTestUtils"
import { ObjectParserModel, ParserModel, ParserModelType } from "./ParserModel"

export default function generateParserModel(
  func: ts.FunctionDeclaration,
  prog: ts.Program,
): ParserModelMap {
  const typeChecker = prog.getTypeChecker()
  const returnTypeType = getInferedReturnTypeOfFunction(func, typeChecker)
  const generator = new ModelGenerator(prog)
  const rootParser = generator.generate(returnTypeType.type)
  return {
    root: rootParser,
    deps: [...generator.symbolParsers].reduce<Record<string, ParserModel>>(
      (result, [sym, parserModel]) => ({ ...result, [sym.name]: parserModel }),
      {},
    ),
  }
}

interface ParserModelMap {
  root: ParserModel
  deps: Record<string, ParserModel>
}

class ModelGenerator {
  private readonly typeChecker: ts.TypeChecker
  public readonly symbolParsers: Map<ts.Symbol, ParserModel>

  constructor(private readonly prog: ts.Program) {
    this.typeChecker = prog.getTypeChecker()
    this.symbolParsers = new Map<ts.Symbol, ParserModel>()
  }

  public generate(type: ts.Type, resolveReference = false): ParserModel {
    const typeNode = this.typeChecker.typeToTypeNode(type, undefined, undefined)

    if (!typeNode) {
      throw new Error("TypeNode expected")
    }

    if (type.isStringLiteral()) {
      return {
        type: ParserModelType.StringLiteral,
        literal: type.value,
      }
    } else if (type.isNumberLiteral()) {
      return {
        type: ParserModelType.NumberLiteral,
        literal: type.value,
      }
    } else if (type.flags === ts.TypeFlags.BooleanLiteral) {
      if (!ts.isLiteralTypeNode(typeNode)) {
        throw new Error("BooleanLiteral type has no LiteralTypeNode")
      }
      const isTrue = typeNode.literal.kind === ts.SyntaxKind.TrueKeyword
      return {
        type: ParserModelType.BooleanLiteral,
        literal: isTrue,
      }
    }

    if (type.flags === ts.TypeFlags.String) {
      return {
        type: ParserModelType.String,
      }
    }
    if (type.flags === ts.TypeFlags.Number) {
      return {
        type: ParserModelType.Number,
      }
    } else if (hasTypeFlag(type, ts.TypeFlags.Boolean)) {
      // boolean's are *also* unions of true|false literals
      return {
        type: ParserModelType.Boolean,
      }
    }

    if (type.symbol && this.symbolParsers.has(type.symbol)) {
      // if (
      //   ts.isTypeReferenceNode(typeNode) &&
      //   // NOTE we willen hier *expliciet* type.symbol ipv symbol
      //   // omdat dat de alias kan zijn. Maar we willen juist weten
      //   // of type.symbol een MappedType is
      //   type.symbol?.declarations?.[0] &&
      //   ts.isMappedTypeNode(type.symbol.declarations?.[0])
      // ) {
      //   // NOTHING
      //   console.log("MAPPED TYPE", symbol.name)
      // } else {
      //   console.log("HALT", symbol.name, symbol.declarations?.[0].kind)
      //   return {
      //     type: ParserModelType.StringLiteral,
      //     literal: `ref to ${symbol?.name} X${type.aliasSymbol?.name ?? "x"} X${
      //       type.symbol?.name ?? "x"
      //     }`,
      //   }
      // }
      // return this.symbolParsers.get(symbol) as ParserModel

      return {
        type: ParserModelType.Reference,
        typeName: type.symbol.name,
      }
    }

    if (type.aliasSymbol && !resolveReference) {
      this.symbolParsers.set(type.aliasSymbol, this.generate(type, true))
      return {
        type: ParserModelType.Reference,
        typeName: type.aliasSymbol.name,
      }
    }

    // NOTE: union possible has no symbol/aliasSymbol
    if (type.isUnion()) {
      // NOTE: type.types will expand union of unions
      // ts.isUnionTypeNode will get the actual written union types
      // using the TypeNode will render more efficient code
      const unionTypeParsers = type.types.map((type) => this.generate(type))

      if (
        unionTypeParsers.length === 2 &&
        unionTypeParsers[0].type === ParserModelType.BooleanLiteral &&
        unionTypeParsers[1].type === ParserModelType.BooleanLiteral &&
        // one is true, and the other false
        unionTypeParsers[0].literal !== unionTypeParsers[1].literal
      ) {
        return {
          type: ParserModelType.Boolean,
        }
      }

      return {
        type: ParserModelType.Union,
        oneOf: unionTypeParsers,
      }
    }

    if (type.symbol.name === "Array") {
      const arrayTypeArgs = this.typeChecker.getTypeArguments(
        type as ts.TypeReference,
      )
      const elementType = arrayTypeArgs[0]

      if (!elementType) {
        throw new Error("Array has no TypeElement")
      }

      return {
        type: ParserModelType.Array,
        element: {
          type: ParserModelType.ArrayElement,
          parser: this.generate(elementType),
        },
      }
    }

    if (hasTypeFlag(type, ts.TypeFlags.Object)) {
      // console.log(
      //   "ts.isTupleTypeNode(typeNode)",
      //   ts.isTupleTypeNode(typeNode),
      //   printCode(typeNode),
      //   ts.isTypeReferenceNode(typeNode) ? typeNode.typeName,
      //   type.symbol?.name,
      //   type.aliasSymbol?.name,
      // )
      // if (
      //   // the return type itself is an tuple
      //   ts.isTupleTypeNode(typeNode) // ||
      //   // the return type is a reference to a tuple type
      //   // (ts.isTypeReferenceNode(typeNode) && !type.symbol.name === "Array",
      // ) {
      //   const arrayTypeArgs = this.typeChecker.getTypeArguments(
      //     type as ts.TypeReference,
      //   )
      //   console.log("arrayTypeArgs", arrayTypeArgs.length)

      //   return {
      //     type: ParserModelType.Tuple,
      //     elements: arrayTypeArgs.map((arrayTypeArg, position) => ({
      //       type: ParserModelType.TupleElement,
      //       position,
      //       parser: this.generate(arrayTypeArg),
      //     })),
      //   }
      // }
      if (ts.isArrayTypeNode(typeNode)) {
        const arrayTypeArgs = this.typeChecker.getTypeArguments(
          type as ts.TypeReference,
        )
        const elementType = arrayTypeArgs[0]

        if (!elementType) {
          throw new Error("Array has no TypeElement")
        }

        return {
          type: ParserModelType.Array,
          element: {
            type: ParserModelType.ArrayElement,
            parser: this.generate(elementType),
          },
        }
      }
    }

    if (type.isClassOrInterface() && !resolveReference) {
      this.symbolParsers.set(type.symbol, this.generate(type, true))

      return {
        type: ParserModelType.Reference,
        typeName: type.symbol.name,
      }
    }

    if (hasTypeFlag(type, ts.TypeFlags.Object)) {
      return {
        type: ParserModelType.Object,
        members: type.getProperties().map((propSymbol) => {
          const propType = this.typeChecker.getTypeOfSymbolAtLocation(
            propSymbol,
            propSymbol.declarations?.[0] as any,
          )

          return {
            type: ParserModelType.Member,
            name: propSymbol.name,
            optional:
              (propSymbol.flags & ts.SymbolFlags.Optional) ===
              ts.SymbolFlags.Optional,
            parser: this.generate(propType),
          }
        }),
      }
    }

    // symbols

    console.log("typeNames", getTypeNames(type))
    console.log("symbolFlags", getSymbolFlags(type.symbol?.flags))
    console.log("typeFlags", getTypeFlags(type.flags))
    // console.log("object", getObjectFlags(type.symbol.flags))

    throw new Error("Only literal " + getTypeFlags(type.flags))
  }
}

function hasTypeFlag(type: ts.Type, flag: ts.TypeFlags): boolean {
  return (type.flags & flag) === flag
}

function getInferedReturnTypeOfFunction(
  func: ts.FunctionDeclaration,
  typeChecker: ts.TypeChecker,
): { type: ts.Type; typeNode: ts.TypeNode } {
  if (func.type) {
    // lets infer the return type
    // https://stackoverflow.com/questions/66108003/typescript-infer-type-params-with-compiler-api
    const sig = typeChecker.getSignatureFromDeclaration(func)
    const returnType = sig && typeChecker.getReturnTypeOfSignature(sig)
    if (returnType) {
      return { type: returnType, typeNode: func.type }
    }
  }

  throw new Error("Unexpected function returnType")
}

export function getTypeFlags(flags: ts.TypeFlags): string[] {
  const isFlag = (f: ts.TypeFlags): boolean => (flags & f) === f
  const result: (string | undefined)[] = [
    isFlag(ts.TypeFlags.Any) ? "Any" : undefined,
    isFlag(ts.TypeFlags.Unknown) ? "Unknown" : undefined,
    isFlag(ts.TypeFlags.String) ? "String" : undefined,
    isFlag(ts.TypeFlags.Number) ? "Number" : undefined,
    isFlag(ts.TypeFlags.Boolean) ? "Boolean" : undefined,
    isFlag(ts.TypeFlags.Enum) ? "Enum" : undefined,
    isFlag(ts.TypeFlags.BigInt) ? "BigInt" : undefined,
    isFlag(ts.TypeFlags.StringLiteral) ? "StringLiteral" : undefined,
    isFlag(ts.TypeFlags.NumberLiteral) ? "NumberLiteral" : undefined,
    isFlag(ts.TypeFlags.BooleanLiteral) ? "BooleanLiteral" : undefined,
    isFlag(ts.TypeFlags.EnumLiteral) ? "EnumLiteral" : undefined,
    isFlag(ts.TypeFlags.BigIntLiteral) ? "BigIntLiteral" : undefined,
    isFlag(ts.TypeFlags.ESSymbol) ? "ESSymbol" : undefined,
    isFlag(ts.TypeFlags.UniqueESSymbol) ? "UniqueESSymbol" : undefined,
    isFlag(ts.TypeFlags.Void) ? "Void" : undefined,
    isFlag(ts.TypeFlags.Undefined) ? "Undefined" : undefined,
    isFlag(ts.TypeFlags.Null) ? "Null" : undefined,
    isFlag(ts.TypeFlags.Never) ? "Never" : undefined,
    isFlag(ts.TypeFlags.TypeParameter) ? "TypeParameter" : undefined,
    isFlag(ts.TypeFlags.Object) ? "Object" : undefined,
    isFlag(ts.TypeFlags.Union) ? "Union" : undefined,
    isFlag(ts.TypeFlags.Intersection) ? "Intersection" : undefined,
    isFlag(ts.TypeFlags.Index) ? "Index" : undefined,
    isFlag(ts.TypeFlags.IndexedAccess) ? "IndexedAccess" : undefined,
    isFlag(ts.TypeFlags.Conditional) ? "Conditional" : undefined,
    isFlag(ts.TypeFlags.Substitution) ? "Substitution" : undefined,
    isFlag(ts.TypeFlags.NonPrimitive) ? "NonPrimitive" : undefined,
    isFlag(ts.TypeFlags.TemplateLiteral) ? "TemplateLiteral" : undefined,
    isFlag(ts.TypeFlags.StringMapping) ? "StringMapping" : undefined,
    isFlag(ts.TypeFlags.Literal) ? "Literal" : undefined,
    isFlag(ts.TypeFlags.Unit) ? "Unit" : undefined,
    isFlag(ts.TypeFlags.StringOrNumberLiteral)
      ? "StringOrNumberLiteral"
      : undefined,
    isFlag(ts.TypeFlags.PossiblyFalsy) ? "PossiblyFalsy" : undefined,
    isFlag(ts.TypeFlags.StringLike) ? "StringLike" : undefined,
    isFlag(ts.TypeFlags.NumberLike) ? "NumberLike" : undefined,
    isFlag(ts.TypeFlags.BigIntLike) ? "BigIntLike" : undefined,
    isFlag(ts.TypeFlags.BooleanLike) ? "BooleanLike" : undefined,
    isFlag(ts.TypeFlags.EnumLike) ? "EnumLike" : undefined,
    isFlag(ts.TypeFlags.ESSymbolLike) ? "ESSymbolLike" : undefined,
    isFlag(ts.TypeFlags.VoidLike) ? "VoidLike" : undefined,
    isFlag(ts.TypeFlags.UnionOrIntersection)
      ? "UnionOrIntersection"
      : undefined,
    isFlag(ts.TypeFlags.StructuredType) ? "StructuredType" : undefined,
    isFlag(ts.TypeFlags.TypeVariable) ? "TypeVariable" : undefined,
    isFlag(ts.TypeFlags.InstantiableNonPrimitive)
      ? "InstantiableNonPrimitive"
      : undefined,
    isFlag(ts.TypeFlags.InstantiablePrimitive)
      ? "InstantiablePrimitive"
      : undefined,
    isFlag(ts.TypeFlags.Instantiable) ? "Instantiable" : undefined,
    isFlag(ts.TypeFlags.StructuredOrInstantiable)
      ? "StructuredOrInstantiable"
      : undefined,
    isFlag(ts.TypeFlags.Narrowable) ? "Narrowable" : undefined,
  ].filter((f) => !!f)

  return result.filter((r): r is string => !!r)
}

export function getSymbolFlags(flags: ts.SymbolFlags): string[] {
  const isFlag = (f: ts.SymbolFlags): boolean => (flags & f) === f
  const result: (string | undefined)[] = [
    isFlag(ts.SymbolFlags.FunctionScopedVariable)
      ? "FunctionScopedVariable"
      : undefined,
    isFlag(ts.SymbolFlags.BlockScopedVariable)
      ? "BlockScopedVariable"
      : undefined,
    isFlag(ts.SymbolFlags.Property) ? "Property" : undefined,
    isFlag(ts.SymbolFlags.EnumMember) ? "EnumMember" : undefined,
    isFlag(ts.SymbolFlags.Function) ? "Function" : undefined,
    isFlag(ts.SymbolFlags.Class) ? "Class" : undefined,
    isFlag(ts.SymbolFlags.Interface) ? "Interface" : undefined,
    isFlag(ts.SymbolFlags.ConstEnum) ? "ConstEnum" : undefined,
    isFlag(ts.SymbolFlags.RegularEnum) ? "RegularEnum" : undefined,
    isFlag(ts.SymbolFlags.ValueModule) ? "ValueModule" : undefined,
    isFlag(ts.SymbolFlags.NamespaceModule) ? "NamespaceModule" : undefined,
    isFlag(ts.SymbolFlags.TypeLiteral) ? "TypeLiteral" : undefined,
    isFlag(ts.SymbolFlags.ObjectLiteral) ? "ObjectLiteral" : undefined,
    isFlag(ts.SymbolFlags.Method) ? "Method" : undefined,
    isFlag(ts.SymbolFlags.Constructor) ? "Constructor" : undefined,
    isFlag(ts.SymbolFlags.GetAccessor) ? "GetAccessor" : undefined,
    isFlag(ts.SymbolFlags.SetAccessor) ? "SetAccessor" : undefined,
    isFlag(ts.SymbolFlags.Signature) ? "Signature" : undefined,
    isFlag(ts.SymbolFlags.TypeParameter) ? "TypeParameter" : undefined,
    isFlag(ts.SymbolFlags.TypeAlias) ? "TypeAlias" : undefined,
    isFlag(ts.SymbolFlags.ExportValue) ? "ExportValue" : undefined,
    isFlag(ts.SymbolFlags.Alias) ? "Alias" : undefined,
    isFlag(ts.SymbolFlags.Prototype) ? "Prototype" : undefined,
    isFlag(ts.SymbolFlags.ExportStar) ? "ExportStar" : undefined,
    isFlag(ts.SymbolFlags.Optional) ? "Optional" : undefined,
    isFlag(ts.SymbolFlags.Transient) ? "Transient" : undefined,
    isFlag(ts.SymbolFlags.Assignment) ? "Assignment" : undefined,
    isFlag(ts.SymbolFlags.ModuleExports) ? "ModuleExports" : undefined,
    isFlag(ts.SymbolFlags.Enum) ? "Enum" : undefined,
    isFlag(ts.SymbolFlags.Variable) ? "Variable" : undefined,
    isFlag(ts.SymbolFlags.Value) ? "Value" : undefined,
    isFlag(ts.SymbolFlags.Type) ? "Type" : undefined,
    isFlag(ts.SymbolFlags.Namespace) ? "Namespace" : undefined,
    isFlag(ts.SymbolFlags.Module) ? "Module" : undefined,
    isFlag(ts.SymbolFlags.Accessor) ? "Accessor" : undefined,
    isFlag(ts.SymbolFlags.FunctionScopedVariableExcludes)
      ? "FunctionScopedVariableExcludes"
      : undefined,
    isFlag(ts.SymbolFlags.BlockScopedVariableExcludes)
      ? "BlockScopedVariableExcludes"
      : undefined,
    isFlag(ts.SymbolFlags.ParameterExcludes) ? "ParameterExcludes" : undefined,
    isFlag(ts.SymbolFlags.PropertyExcludes) ? "PropertyExcludes" : undefined,
    isFlag(ts.SymbolFlags.EnumMemberExcludes)
      ? "EnumMemberExcludes"
      : undefined,
    isFlag(ts.SymbolFlags.FunctionExcludes) ? "FunctionExcludes" : undefined,
    isFlag(ts.SymbolFlags.ClassExcludes) ? "ClassExcludes" : undefined,
    isFlag(ts.SymbolFlags.InterfaceExcludes) ? "InterfaceExcludes" : undefined,
    isFlag(ts.SymbolFlags.RegularEnumExcludes)
      ? "RegularEnumExcludes"
      : undefined,
    isFlag(ts.SymbolFlags.ConstEnumExcludes) ? "ConstEnumExcludes" : undefined,
    isFlag(ts.SymbolFlags.ValueModuleExcludes)
      ? "ValueModuleExcludes"
      : undefined,
    isFlag(ts.SymbolFlags.NamespaceModuleExcludes)
      ? "NamespaceModuleExcludes"
      : undefined,
    isFlag(ts.SymbolFlags.MethodExcludes) ? "MethodExcludes" : undefined,
    isFlag(ts.SymbolFlags.GetAccessorExcludes)
      ? "GetAccessorExcludes"
      : undefined,
    isFlag(ts.SymbolFlags.SetAccessorExcludes)
      ? "SetAccessorExcludes"
      : undefined,
    isFlag(ts.SymbolFlags.TypeParameterExcludes)
      ? "TypeParameterExcludes"
      : undefined,
    isFlag(ts.SymbolFlags.TypeAliasExcludes) ? "TypeAliasExcludes" : undefined,
    isFlag(ts.SymbolFlags.AliasExcludes) ? "AliasExcludes" : undefined,
    isFlag(ts.SymbolFlags.ModuleMember) ? "ModuleMember" : undefined,
    isFlag(ts.SymbolFlags.ExportHasLocal) ? "ExportHasLocal" : undefined,
    isFlag(ts.SymbolFlags.BlockScoped) ? "BlockScoped" : undefined,
    isFlag(ts.SymbolFlags.PropertyOrAccessor)
      ? "PropertyOrAccessor"
      : undefined,
    isFlag(ts.SymbolFlags.ClassMember) ? "ClassMember" : undefined,
  ].filter((f) => !!f)

  return result.filter((r): r is string => !!r)
}

export function getObjectFlags(flags: ts.ObjectFlags): string[] {
  const isFlag = (f: ts.ObjectFlags): boolean => (flags & f) === f
  const result: (string | undefined)[] = [
    isFlag(ts.ObjectFlags.Class) ? "Class" : undefined,
    isFlag(ts.ObjectFlags.Interface) ? "Interface" : undefined,
    isFlag(ts.ObjectFlags.Reference) ? "Reference" : undefined,
    isFlag(ts.ObjectFlags.Tuple) ? "Tuple" : undefined,
    isFlag(ts.ObjectFlags.Anonymous) ? "Anonymous" : undefined,
    isFlag(ts.ObjectFlags.Mapped) ? "Mapped" : undefined,
    isFlag(ts.ObjectFlags.Instantiated) ? "Instantiated" : undefined,
    isFlag(ts.ObjectFlags.ObjectLiteral) ? "ObjectLiteral" : undefined,
    isFlag(ts.ObjectFlags.EvolvingArray) ? "EvolvingArray" : undefined,
    isFlag(ts.ObjectFlags.ObjectLiteralPatternWithComputedProperties)
      ? "ObjectLiteralPatternWithComputedProperties"
      : undefined,
    isFlag(ts.ObjectFlags.ReverseMapped) ? "ReverseMapped" : undefined,
    isFlag(ts.ObjectFlags.JsxAttributes) ? "JsxAttributes" : undefined,
    isFlag(ts.ObjectFlags.JSLiteral) ? "JSLiteral" : undefined,
    isFlag(ts.ObjectFlags.FreshLiteral) ? "FreshLiteral" : undefined,
    isFlag(ts.ObjectFlags.ArrayLiteral) ? "ArrayLiteral" : undefined,
    isFlag(ts.ObjectFlags.ClassOrInterface) ? "ClassOrInterface" : undefined,
    isFlag(ts.ObjectFlags.ContainsSpread) ? "ContainsSpread" : undefined,
    isFlag(ts.ObjectFlags.ObjectRestType) ? "ObjectRestType" : undefined,
    isFlag(ts.ObjectFlags.InstantiationExpressionType)
      ? "InstantiationExpressionType"
      : undefined,
  ].filter((f) => !!f)

  return result.filter((r): r is string => !!r)
}

function getTypeNames(type: ts.Type): string[] {
  return [
    type.isUnion() ? "UnionType" : undefined,
    type.isIntersection() ? "IntersectionType" : undefined,
    type.isUnionOrIntersection() ? "UnionOrIntersectionType" : undefined,
    type.isLiteral() ? "LiteralType" : undefined,
    type.isStringLiteral() ? "StringLiteralType" : undefined,
    type.isNumberLiteral() ? "NumberLiteralType" : undefined,
    type.isTypeParameter() ? "TypeParameter" : undefined,
    type.isClassOrInterface() ? "InterfaceType" : undefined,
    type.isClass() ? "InterfaceType" : undefined,
    type.isIndexType() ? "IndexType" : undefined,
  ].filter((r): r is string => !!r)
}
