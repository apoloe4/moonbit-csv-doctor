///|
test "quoted commas, escaped quotes, UTF-8 and trailing empty fields" {
  let rows = parse_csv("name,note,last\r\n张三,\"a,b\" ,\r\n", ',') catch {
    _ => []
  }
  assert_eq(rows.length(), 0)
  let valid = parse_csv("name,note,last\r\n张三,\"a,\"\"b\"\"\",\r\n", ',')
  assert_eq(valid.length(), 2)
  assert_eq(valid[1].cells, ["张三", "a,\"b\"", ""])
}

///|
test "BOM, multiline and physical lines" {
  let rows = parse_csv("\u{FEFF}id,note\r\n1,\"a\r\nb\"\r\n2,x", ',')
  assert_eq(rows[0].cells, ["id", "note"])
  assert_eq(rows[1].line, 2)
  assert_eq(rows[2].line, 4)
  assert_eq(rows[1].cells[1], "a\r\nb")
}

///|
test "trailing delimiter, blank records, mixed line endings" {
  let rows = parse_csv("a;b\n1;\r\n\r2;3\n", ';')
  assert_eq(rows.length(), 4)
  assert_eq(rows[1].cells, ["1", ""])
  assert_eq(rows[2].cells, [""])
  assert_eq(rows[3].line, 4)
}

///|
test "malformed CSV fails closed" {
  for csv in ["a\n\"open", "a\nb\"c", "a\n\"x\"z", "", "a,a\n1,2", "a,\n1,2"] {
    let result = @json.parse(analyze(csv, "{}"))
    match result {
      { "status": "error", .. } => ()
      _ => fail("must reject \{csv}")
    }
  }
}

///|
test "five rule families and correct row counts" {
  let csv = "id,amount,state,active\nA,10,paid,true\nA,-1,other,yes\n,abc,paid,false"
  let rules =
    #|{"columns":[{"column":"id","required":true,"unique":true},{"column":"amount","type":"number","min":0,"max":100},{"column":"state","enum":["paid","new"]},{"column":"active","type":"boolean"}]}
  let report = inspect_data(csv, rules)
  match report {
    {
      "rows": 3,
      "failedRows": 2,
      "passedRows": 1,
      "issueCount": 6,
      "status": "fail",
      ..
    } => ()
    _ => fail(report.stringify())
  }
}

///|
test "optional blanks skip rules; required whitespace fails" {
  let report = inspect_data(
    "id,n\n,\n, \n", "{\"columns\":[{\"column\":\"id\",\"unique\":true},{\"column\":\"n\",\"required\":true,\"type\":\"integer\"}]}",
  )
  match report {
    { "issueCount": 2, "failedRows": 2, .. } => ()
    _ => fail(report.stringify())
  }
}

///|
test "strict configuration avoids silent misspelled rules" {
  for
    rules in [
      "[]", "{", "{\"colums\":[]}", "{\"delimiter\":\"ab\"}", "{\"columns\":[{\"column\":\"a\",\"min\":2}]}",
      "{\"columns\":[{\"column\":\"x\"}]}", "{\"columns\":[{\"column\":\"a\",\"required\":\"yes\"}]}",
      "{\"columns\":[{\"column\":\"a\",\"type\":\"number\",\"min\":5,\"max\":1}]}",
      "{\"columns\":[{\"column\":\"a\",\"enum\":[1]}]}",
    ] {
    match @json.parse(analyze("a\n1", rules)) {
      { "status": "error", .. } => ()
      _ => fail(rules)
    }
  }
}

///|
test "column mismatch is an issue, header-only is valid" {
  match inspect_data("a,b\n1\n1,2,3", "{}") {
    { "issueCount": 2, "failedRows": 2, .. } => ()
    _ => fail("shape")
  }
  match inspect_data("a,b\n", "{}") {
    { "rows": 0, "status": "pass", .. } => ()
    _ => fail("header only")
  }
}

///|
test "numeric bounds, finite values and integer precision" {
  let report = inspect_data(
    "n\n1.5\n9007199254740992\nNaN\n1e999\n-2\n10\n3", "{\"columns\":[{\"column\":\"n\",\"type\":\"integer\",\"min\":0,\"max\":5}]}",
  )
  match report {
    { "failedRows": 6, "passedRows": 1, .. } => ()
    _ => fail(report.stringify())
  }
}

///|
test "duplicate diagnostic uses physical multiline position" {
  let report = inspect_data(
    "id,note\nA,\"x\ny\"\nA,z", "{\"columns\":[{\"column\":\"id\",\"unique\":true}]}",
  )
  match report {
    {
      "issues": [
        {
          "row": 2,
          "line": 4,
          "code": "unique",
          "message": "值重复，首次出现在第 2 行",
          ..
        },
      ],
      ..
    } => ()
    _ => fail(report.stringify())
  }
}
