import readline from "node:readline";

export type SelectOption<T> = { value: T; label: string };

/**
 * Multi-choice prompt. On a TTY: arrows move, number selects, Enter confirms
 * the highlighted default. Without a TTY: type a number, or Enter for default.
 */
export async function promptSelect<T>(
  label: string,
  options: SelectOption<T>[],
  defaultIndex = 0,
): Promise<T> {
  if (options.length === 0) throw new Error("promptSelect needs at least one option");
  const initial = clampIndex(defaultIndex, options.length);
  if (process.stdin.isTTY && process.stdout.isTTY) {
    return selectTty(label, options, initial);
  }
  return selectLine(label, options, initial);
}

/**
 * Text prompt. Defaults show in brackets after the label. Enter keeps the
 * default. Required fields with no default re-ask until there is a value.
 */
export async function promptText(
  label: string,
  opts: {
    default?: string;
    required?: boolean;
    validate?: (value: string) => string | undefined;
  } = {},
): Promise<string> {
  const suffix = opts.default ? ` (${opts.default})` : "";
  for (;;) {
    const raw = await question(`${label}${suffix}: `);
    const value = raw.trim() || opts.default || "";
    if (!value && opts.required) {
      process.stderr.write("a value is required\n");
      continue;
    }
    const error = opts.validate?.(value);
    if (error) {
      process.stderr.write(`${error}\n`);
      continue;
    }
    return value;
  }
}

function question(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY),
  });
  return new Promise((resolve, reject) => {
    rl.on("SIGINT", () => {
      rl.close();
      reject(new Error("cancelled"));
    });
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function selectLine<T>(
  label: string,
  options: SelectOption<T>[],
  defaultIndex: number,
): Promise<T> {
  process.stdout.write(`${label}\n`);
  for (const [i, option] of options.entries()) {
    process.stdout.write(`  ${i + 1}. ${option.label}\n`);
  }
  for (;;) {
    const raw = await question(`${label} [${defaultIndex + 1}]: `);
    const trimmed = raw.trim();
    if (!trimmed) return optionAt(options, defaultIndex).value;
    const n = Number(trimmed);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) {
      return optionAt(options, n - 1).value;
    }
    process.stderr.write(`enter a number 1-${options.length}\n`);
  }
}

async function selectTty<T>(
  label: string,
  options: SelectOption<T>[],
  defaultIndex: number,
): Promise<T> {
  const stdin = process.stdin as NodeJS.ReadStream;
  if (stdin.isTTY && stdin.isRaw) stdin.setRawMode(false);
  stdin.pause();
  // The Enter that closed the previous text prompt is still on stdin. Drain it
  // or this menu confirms the default before the user can move.
  await discardPendingInput(stdin);
  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  let index = defaultIndex;
  const draw = (first: boolean) => {
    if (!first) process.stdout.write(`\x1b[${options.length + 1}A`);
    process.stdout.write(`${label}\n`);
    for (const [i, option] of options.entries()) {
      const mark = i === index ? ">" : " ";
      process.stdout.write(`${mark} ${i + 1}. ${option.label}\n`);
    }
  };
  draw(true);
  return new Promise((resolve, reject) => {
    let armed = false;
    const armTimer = setImmediate(() => {
      armed = true;
    });
    const finish = (value: T) => {
      cleanup();
      process.stdout.write(`\x1b[${options.length + 1}A\x1b[J`);
      const chosen = options.find((option) => Object.is(option.value, value));
      process.stdout.write(`${label}: ${chosen?.label ?? String(value)}\n`);
      resolve(value);
    };
    const onKeypress = (_str: string, key: readline.Key) => {
      if (!key || !armed) return;
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("cancelled"));
        return;
      }
      if (key.name === "up") {
        index = (index - 1 + options.length) % options.length;
        draw(false);
        return;
      }
      if (key.name === "down") {
        index = (index + 1) % options.length;
        draw(false);
        return;
      }
      if (key.name === "return") {
        finish(optionAt(options, index).value);
        return;
      }
      const n = Number(_str);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        finish(optionAt(options, n - 1).value);
      }
    };
    const cleanup = () => {
      clearImmediate(armTimer);
      stdin.off("keypress", onKeypress);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on("keypress", onKeypress);
  });
}

/**
 * Restore cooked mode and drop stdin handles so the process can exit after
 * an interactive command. `emitKeypressEvents` otherwise leaves stdin flowing.
 */
export function releaseStdin(
  stdin: NodeJS.ReadStream = process.stdin as NodeJS.ReadStream,
): void {
  try {
    if (stdin.isTTY && typeof stdin.setRawMode === "function" && stdin.isRaw) {
      stdin.setRawMode(false);
    }
  } catch {
    // ignore
  }
  stdin.removeAllListeners("keypress");
  stdin.pause();
  if (typeof stdin.unref === "function") stdin.unref();
}

/** Drop CR/LF left over after readline.question so the next raw-mode select waits. */
export function discardPendingInput(stdin: NodeJS.ReadableStream): Promise<void> {
  return new Promise((resolve) => {
    const flush = () => {
      const readable = stdin as NodeJS.ReadStream;
      if (typeof readable.read !== "function") return;
      let chunk: string | Buffer | null = readable.read();
      while (chunk !== null) {
        chunk = readable.read();
      }
    };
    flush();
    setImmediate(() => {
      flush();
      setImmediate(resolve);
    });
  });
}

function optionAt<T>(options: SelectOption<T>[], index: number): SelectOption<T> {
  const option = options[index];
  if (!option) throw new Error(`no option at ${index}`);
  return option;
}

function clampIndex(index: number, length: number): number {
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}
