declare module 'uuid' {
  export function v4(): string;
  export function v1(): string;
  export function v3(name: string, namespace: string | ArrayLike<number>): string;
  export function v5(name: string, namespace: string | ArrayLike<number>): string;
  export function validate(uuid: string): boolean;
  export function version(uuid: string): number;
}
