///|
/// CSV records retain their physical start line, even when fields span lines.
struct Record {
  cells : Array[String]
  spans : Array[SourceSpan]
  line : Int
} derive(Eq)

///|
/// Half-open source ranges include CSV quotes; offsets include a leading BOM.
struct SourceSpan {
  startUtf16 : Int
  endUtf16 : Int
  startByte : Int
  endByte : Int
  startLine : Int
  startColumn : Int
  endLine : Int
  endColumn : Int
} derive(Eq, ToJson)

///|
pub(all) suberror DoctorError {
  Invalid(String)
}

///|
/// Strict RFC-4180-style parser. LF, CRLF and CR record endings are accepted.
fn parse_csv(
  text : String,
  delimiter : Char,
) -> Array[Record] raise DoctorError {
  let chars = text.iter().to_array()
  let records : Array[Record] = []
  let mut cells : Array[String] = []
  let mut spans : Array[SourceSpan] = []
  let field = StringBuilder()
  let mut i = if chars.length() > 0 && chars[0] == '\u{FEFF}' { 1 } else { 0 }
  let mut u16 = i
  let mut bytes = i * 3
  let mut source_line = 1
  let mut source_column = 1
  let mut field_u16 = u16
  let mut field_bytes = bytes
  let mut field_line = 1
  let mut field_column = 1
  let mut line = 1
  let mut start = 1
  // 0: unquoted, 1: quoted, 2: closed quote
  let mut state = 0
  let mut touched = false
  while i < chars.length() {
    let before = i
    let mut next_field = false
    let c = chars[i]
    if state == 1 {
      if c == '"' {
        if i + 1 < chars.length() && chars[i + 1] == '"' {
          field.write_char('"')
          i = i + 1
        } else {
          state = 2
        }
      } else {
        field.write_char(c)
        if c == '\r' {
          line = line + 1
          if i + 1 < chars.length() && chars[i + 1] == '\n' {
            field.write_char('\n')
            i = i + 1
          }
        } else if c == '\n' {
          line = line + 1
        }
      }
    } else if c == delimiter {
      spans.push({
        startUtf16: field_u16,
        endUtf16: u16,
        startByte: field_bytes,
        endByte: bytes,
        startLine: field_line,
        startColumn: field_column,
        endLine: source_line,
        endColumn: source_column,
      })
      next_field = true
      cells.push(field.to_string())
      field.reset()
      state = 0
      touched = true
    } else if c == '\r' || c == '\n' {
      spans.push({
        startUtf16: field_u16,
        endUtf16: u16,
        startByte: field_bytes,
        endByte: bytes,
        startLine: field_line,
        startColumn: field_column,
        endLine: source_line,
        endColumn: source_column,
      })
      next_field = true
      cells.push(field.to_string())
      records.push({ cells, spans, line: start, })
      cells = []
      spans = []
      field.reset()
      state = 0
      touched = false
      if c == '\r' && i + 1 < chars.length() && chars[i + 1] == '\n' {
        i = i + 1
      }
      line = line + 1
      start = line
    } else if state == 2 {
      raise Invalid(
        "第 \{line} 行：结束引号后只能出现分隔符或换行",
      )
    } else if c == '"' {
      if !field.is_empty() {
        raise Invalid("第 \{line} 行：未加引号的字段中出现引号")
      }
      state = 1
      touched = true
    } else {
      field.write_char(c)
      touched = true
    }
    // Advance over every consumed scalar, including escaped quotes and CRLF.
    for j = before; j <= i; j = j + 1 {
      let cp = chars[j].to_int()
      u16 = u16 + (if cp > 0xFFFF { 2 } else { 1 })
      bytes = bytes +
        (if cp <= 0x7F {
          1
        } else if cp <= 0x7FF {
          2
        } else if cp <= 0xFFFF {
          3
        } else {
          4
        })
      if chars[j] == '\r' {
        source_line = source_line + 1
        source_column = 1
      } else if chars[j] == '\n' {
        if j == 0 || chars[j - 1] != '\r' {
          source_line = source_line + 1
        }
        source_column = 1
      } else {
        source_column = source_column + 1
      }
    }
    if next_field {
      field_u16 = u16
      field_bytes = bytes
      field_line = source_line
      field_column = source_column
    }
    i = i + 1
  }
  if state == 1 {
    raise Invalid("第 \{start} 行：引号未闭合")
  }
  if touched || cells.length() > 0 {
    spans.push({
      startUtf16: field_u16,
      endUtf16: u16,
      startByte: field_bytes,
      endByte: bytes,
      startLine: field_line,
      startColumn: field_column,
      endLine: source_line,
      endColumn: source_column,
    })
    cells.push(field.to_string())
    records.push({ cells, spans, line: start, })
  }
  records
}

///|
priv struct Rule {
  column : String
  kind : String
  required : Bool
  unique : Bool
  min : Double?
  max : Double?
  allowed : Array[String]?
}

///|
fn string_field(
  obj : Map[String, Json],
  key : String,
  fallback : String,
) -> String raise DoctorError {
  match obj.get(key) {
    None => fallback
    Some(String(s)) => s
    _ => raise Invalid("规则字段 \{key} 必须是字符串")
  }
}

///|
fn bool_field(obj : Map[String, Json], key : String) -> Bool raise DoctorError {
  match obj.get(key) {
    None => false
    Some(True) => true
    Some(False) => false
    _ => raise Invalid("规则字段 \{key} 必须是布尔值")
  }
}

///|
fn number_field(
  obj : Map[String, Json],
  key : String,
) -> Double? raise DoctorError {
  match obj.get(key) {
    None => None
    Some(Number(n, ..)) if !n.is_nan() && !n.is_inf() => Some(n)
    _ => raise Invalid("规则字段 \{key} 必须是有限数值")
  }
}

///|
fn decode_rules(text : String) -> (Array[Rule], Char) raise {
  let json = @json.parse(text)
  let obj = match json {
    Object(o) => o
    _ => raise Invalid("规则必须是 JSON 对象")
  }
  for key, _ in obj {
    if key != "columns" && key != "delimiter" {
      raise Invalid("未知配置字段：\{key}")
    }
  }
  let delim = string_field(obj, "delimiter", ",").iter().to_array()
  if delim.length() != 1 ||
    delim[0] == '"' ||
    delim[0] == '\n' ||
    delim[0] == '\r' ||
    delim[0] == '\u{FEFF}' {
    raise Invalid(
      "分隔符必须是一个字符，且不能是引号、换行或 BOM",
    )
  }
  let items = match obj.get("columns") {
    None => []
    Some(Array(a)) => a
    _ => raise Invalid("columns 必须是数组")
  }
  let rules : Array[Rule] = []
  let seen : Map[String, Bool] = Map([])
  for item in items {
    let o = match item {
      Object(o) => o
      _ => raise Invalid("每条列规则必须是对象")
    }
    for key, _ in o {
      if !["column", "type", "required", "unique", "min", "max", "enum"].contains(
          key,
        ) {
        raise Invalid("未知规则字段：\{key}")
      }
    }
    let column = string_field(o, "column", "")
    if column.is_blank() {
      raise Invalid("规则缺少有效 column")
    }
    if seen.contains(column) {
      raise Invalid("重复列规则：\{column}")
    }
    seen[column] = true
    let kind = string_field(o, "type", "string")
    if !["string", "integer", "number", "boolean"].contains(kind) {
      raise Invalid("不支持的类型：\{kind}")
    }
    let min = number_field(o, "min")
    let max = number_field(o, "max")
    if (min != None || max != None) && kind != "number" && kind != "integer" {
      raise Invalid("min/max 只适用于数值类型")
    }
    match (min, max) {
      (Some(a), Some(b)) if a > b => raise Invalid("min 不能大于 max")
      _ => ()
    }
    let allowed = match o.get("enum") {
      None => None
      Some(Array(a)) => {
        let values : Array[String] = []
        for v in a {
          match v {
            String(s) => values.push(s)
            _ => raise Invalid("enum 只能包含字符串")
          }
        }
        Some(values)
      }
      _ => raise Invalid("enum 必须是字符串数组")
    }
    rules.push({
      column,
      kind,
      required: bool_field(o, "required"),
      unique: bool_field(o, "unique"),
      min,
      max,
      allowed,
    })
  }
  (rules, delim[0])
}

///|
struct Issue {
  row : Int
  line : Int
  column : String
  code : String
  value : String
  message : String
  span : SourceSpan?
} derive(ToJson)

///|
/// Number grammar deliberately matches JSON numbers, excluding NaN/Infinity.
fn numeric(value : String) -> Double? {
  try {
    match @json.parse(value) {
      Number(n, ..) if !n.is_nan() && !n.is_inf() => Some(n)
      _ => None
    }
  } catch {
    _ => None
  }
}

///|
// Check lexical integer syntax before converting to Double: values such as
// 1.0000000000000001 and 1e-999 can otherwise round to an integer.
fn integer_literal(value : String) -> Bool {
  let chars = value.trim().to_owned().iter().to_array()
  let start = if chars.length() > 0 && chars[0] == '-' { 1 } else { 0 }
  if start == chars.length() {
    return false
  }
  if chars.length() - start > 1 && chars[start] == '0' {
    return false
  }
  for i = start; i < chars.length(); i = i + 1 {
    if chars[i] < '0' || chars[i] > '9' {
      return false
    }
  }
  true
}

///|
fn inspect_data(text : String, config : String) -> Json raise {
  let (rules, delimiter) = decode_rules(config)
  let records = parse_csv(text, delimiter)
  if records.is_empty() {
    raise Invalid("CSV 为空，需要标题行")
  }
  let headers = records[0].cells
  let header_map : Map[String, Int] = Map([])
  for i, header in headers {
    if header.is_blank() {
      raise Invalid("第 \{i + 1} 列的标题为空")
    }
    if header_map.contains(header) {
      raise Invalid("标题重复：\{header}")
    }
    header_map[header] = i
  }
  for rule in rules {
    if !header_map.contains(rule.column) {
      raise Invalid("CSV 缺少规则要求的列：\{rule.column}")
    }
  }
  let issues : Array[Issue] = []
  let failed : Map[Int, Bool] = Map([])
  let uniques : Array[Map[String, Int]] = rules.map(_ => Map([]))
  let missing : Array[Int] = Array::make(headers.length(), 0)
  let mut total = 0
  for ri = 1; ri < records.length(); ri = ri + 1 {
    let record = records[ri]
    total = total + 1
    if record.cells.length() != headers.length() {
      issues.push({
        row: ri,
        line: record.line,
        column: "",
        span: None,
        code: "column_count",
        value: "",
        message: "应有 \{headers.length()} 列，实际 \{record.cells.length()} 列",
      })
      failed[ri] = true
    }
    for ci = 0; ci < headers.length(); ci = ci + 1 {
      if ci >= record.cells.length() || record.cells[ci].is_blank() {
        missing[ci] = missing[ci] + 1
      }
    }
    for rule_i, rule in rules {
      let ci = header_map[rule.column]
      let value = if ci < record.cells.length() { record.cells[ci] } else { "" }
      let add = fn(code : String, message : String) {
        issues.push({
          row: ri,
          line: record.line,
          span: if ci < record.spans.length() {
            Some(record.spans[ci])
          } else {
            None
          },
          column: rule.column,
          code,
          value,
          message,
        })
        failed[ri] = true
      }
      if value.is_blank() {
        if rule.required {
          add("required", "必填值为空")
        }
        continue
      }
      if rule.kind == "integer" || rule.kind == "number" {
        match numeric(value) {
          None => add("type", "应为 \{rule.kind}，使用 JSON 数值格式")
          Some(n) => {
            if rule.kind == "integer" &&
              (!integer_literal(value) || n.abs() > 9007199254740991.0) {
              add(
                "type", "应为十进制安全整数，不接受小数或指数（绝对值不超过 9007199254740991）",
              )
            }
            match rule.min {
              Some(m) if n < m => add("min", "数值不得小于 \{m}")
              _ => ()
            }
            match rule.max {
              Some(m) if n > m => add("max", "数值不得大于 \{m}")
              _ => ()
            }
          }
        }
      } else if rule.kind == "boolean" && value != "true" && value != "false" {
        add("type", "布尔值仅接受 true 或 false")
      }
      match rule.allowed {
        Some(values) if !values.contains(value) =>
          add("enum", "值不在允许的枚举列表中")
        _ => ()
      }
      if rule.unique {
        match uniques[rule_i].get(value) {
          Some(first) =>
            add("unique", "值重复，首次出现在第 \{first} 行")
          None => uniques[rule_i][value] = record.line
        }
      }
    }
  }
  let profiles : Array[Json] = []
  for i, header in headers {
    profiles.push({
      "column": header.to_json(),
      "missing": missing[i].to_json(),
    })
  }
  {
    "status": (if issues.is_empty() { "pass" } else { "fail" }).to_json(),
    "rows": total.to_json(),
    "columns": headers.to_json(),
    "failedRows": failed.length().to_json(),
    "passedRows": (total - failed.length()).to_json(),
    "issueCount": issues.length().to_json(),
    "issues": issues.to_json(),
    "profiles": profiles.to_json(),
  }
}

///|
/// Public FFI boundary shared by the CLI and browser. Never throws into JS.
pub fn analyze(csv : String, rules_json : String) -> String {
  inspect_data(csv, rules_json).stringify() catch {
    e => {
      let message = match e {
        Invalid(s) => s
        _ => e.to_string()
      }
      let result : Json = { "status": "error", "message": message.to_json() }
      result.stringify()
    }
  }
}
