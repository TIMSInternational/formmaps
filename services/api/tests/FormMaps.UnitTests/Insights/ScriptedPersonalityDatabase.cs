using System.Collections;
using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.UnitTests.Insights;

/// <summary>
/// A scripted, in-memory stand-in for the two personality tables, exposed as an
/// <see cref="IFormMapsDatabaseSessionFactory"/> so <c>PersonalitySessionWriter</c> can be driven in a
/// UNIT test — no Testcontainers, no Docker, no Postgres. It exists for the formmaps#144 insights-trigger
/// pins (<see cref="PersonalityInsightsTriggerTests"/>), which are about WHEN the writer fires the trigger
/// relative to its own commit and idempotency branch — questions that need no real SQL engine. The DB
/// semantics that DO need Postgres (RLS, FOR UPDATE serialization, jsonb round-trip, tz handling) stay in
/// PersonalitySessionWriterTests (Testcontainers).
///
/// It models exactly the three statements CompleteAsync issues, routed on their SQL text, and mutates its
/// own state the way Postgres would — so a second CompleteAsync against the same instance genuinely takes
/// the already-completed replay branch rather than being told to. Any other statement throws, so a future
/// change to the writer's SQL surfaces as a loud test failure instead of a silent no-op.
/// </summary>
internal sealed class ScriptedPersonalityDatabase(
    string ownerUserId,
    string variant,
    int answeredItems,
    string status = "in_progress",
    bool isActive = true) : IFormMapsDatabaseSessionFactory
{
    public string OwnerUserId { get; } = ownerUserId;

    public string Variant { get; } = variant;

    public string Status { get; private set; } = status;

    /// <summary>Durable commits so far — the trigger must fire only after this has been bumped.</summary>
    public int Commits { get; private set; }

    /// <summary>Completing UPDATEs that matched a row — the "was it actually rescored?" counter.</summary>
    public int CompletionUpdates { get; private set; }

    /// <summary>Every statement executed, in order (lets a test pin e.g. the FOR UPDATE lock).</summary>
    public List<string> ExecutedSql { get; } = [];

    public Task<FormMapsDatabaseSession> OpenReadOnlyAsync(
        RequestContext requestContext, CancellationToken cancellationToken = default) => Open(isReadOnly: true);

    public Task<FormMapsDatabaseSession> OpenWritableAsync(
        RequestContext requestContext, CancellationToken cancellationToken = default) => Open(isReadOnly: false);

    private Task<FormMapsDatabaseSession> Open(bool isReadOnly)
    {
        var connection = new FakeConnection(this);
        var transaction = new FakeTransaction(connection, this);
        return Task.FromResult(new FormMapsDatabaseSession(connection, transaction, TenantGucPlan.Bypass(), isReadOnly));
    }

    // ---------------------------------------------------------------- scripted statement handling

    private DbDataReader ExecuteReader(string sql)
    {
        ExecutedSql.Add(sql);

        if (sql.Contains("FROM \"personality_responses\"", StringComparison.Ordinal))
        {
            // (dimension, item_number, choice) for the first `answeredItems` items of the variant, all "A".
            // The dimension is the item bank's own, exactly as SaveAnswerAsync would have persisted it.
            var rows = PersonalityItemBank.GetVariantItems(Variant)
                .Take(answeredItems)
                .Select(item => new object[] { item.Dimension, item.N, "A" })
                .ToList();
            return new FakeReader(["dimension", "item_number", "choice"], rows);
        }

        if (sql.Contains("FROM \"personality_assessment_sessions\"", StringComparison.Ordinal))
        {
            return new FakeReader(
                ["user_id", "status", "variant", "is_active"],
                [[OwnerUserId, Status, Variant, isActive]]);
        }

        throw new NotSupportedException($"ScriptedPersonalityDatabase has no script for: {sql}");
    }

    private int ExecuteNonQuery(string sql)
    {
        ExecutedSql.Add(sql);

        if (!sql.StartsWith("UPDATE \"personality_assessment_sessions\"", StringComparison.Ordinal))
        {
            throw new NotSupportedException($"ScriptedPersonalityDatabase has no script for: {sql}");
        }

        // Mirrors `WHERE "id" = @sessionId AND "status" <> 'completed'`: 0 rows once already completed.
        if (Status == "completed")
        {
            return 0;
        }

        Status = "completed";
        CompletionUpdates++;
        return 1;
    }

    private void Commit() => Commits++;

    // ================================================================== minimal ADO.NET fakes

    private sealed class FakeConnection(ScriptedPersonalityDatabase database) : DbConnection
    {
        [AllowNull]
        public override string ConnectionString { get; set; } = "scripted";

        public override string Database => "scripted";

        public override string DataSource => "scripted";

        public override string ServerVersion => "0";

        public override ConnectionState State => ConnectionState.Open;

        public override void ChangeDatabase(string databaseName) { }

        public override void Close() { }

        public override void Open() { }

        protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel) =>
            new FakeTransaction(this, database);

        protected override DbCommand CreateDbCommand() => new FakeCommand(this, database);
    }

    private sealed class FakeTransaction(DbConnection connection, ScriptedPersonalityDatabase database) : DbTransaction
    {
        protected override DbConnection DbConnection => connection;

        public override IsolationLevel IsolationLevel => IsolationLevel.ReadCommitted;

        public override void Commit() => database.Commit();

        public override void Rollback() { }
    }

    private sealed class FakeCommand(DbConnection connection, ScriptedPersonalityDatabase database) : DbCommand
    {
        [AllowNull]
        public override string CommandText { get; set; } = string.Empty;

        public override int CommandTimeout { get; set; }

        public override CommandType CommandType { get; set; } = CommandType.Text;

        public override bool DesignTimeVisible { get; set; }

        public override UpdateRowSource UpdatedRowSource { get; set; }

        protected override DbConnection? DbConnection { get; set; } = connection;

        protected override DbParameterCollection DbParameterCollection { get; } = new FakeParameterCollection();

        protected override DbTransaction? DbTransaction { get; set; }

        public override void Cancel() { }

        public override int ExecuteNonQuery() => database.ExecuteNonQuery(CommandText);

        public override object? ExecuteScalar() =>
            throw new NotSupportedException($"ScriptedPersonalityDatabase has no scalar script for: {CommandText}");

        public override void Prepare() { }

        protected override DbParameter CreateDbParameter() => new FakeParameter();

        protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior) =>
            database.ExecuteReader(CommandText);
    }

    private sealed class FakeParameter : DbParameter
    {
        public override DbType DbType { get; set; }

        public override ParameterDirection Direction { get; set; } = ParameterDirection.Input;

        public override bool IsNullable { get; set; }

        [AllowNull]
        public override string ParameterName { get; set; } = string.Empty;

        public override int Size { get; set; }

        [AllowNull]
        public override string SourceColumn { get; set; } = string.Empty;

        public override bool SourceColumnNullMapping { get; set; }

        public override object? Value { get; set; }

        public override void ResetDbType() { }
    }

    private sealed class FakeParameterCollection : DbParameterCollection
    {
        private readonly List<DbParameter> _parameters = [];

        public override int Count => _parameters.Count;

        public override object SyncRoot { get; } = new();

        public override int Add(object value)
        {
            _parameters.Add((DbParameter)value);
            return _parameters.Count - 1;
        }

        public override void AddRange(Array values)
        {
            foreach (var value in values)
            {
                Add(value!);
            }
        }

        public override void Clear() => _parameters.Clear();

        public override bool Contains(object value) => _parameters.Contains((DbParameter)value);

        public override bool Contains(string value) => IndexOf(value) >= 0;

        public override void CopyTo(Array array, int index) => ((ICollection)_parameters).CopyTo(array, index);

        public override IEnumerator GetEnumerator() => _parameters.GetEnumerator();

        public override int IndexOf(object value) => _parameters.IndexOf((DbParameter)value);

        public override int IndexOf(string parameterName) =>
            _parameters.FindIndex(p => string.Equals(p.ParameterName, parameterName, StringComparison.Ordinal));

        public override void Insert(int index, object value) => _parameters.Insert(index, (DbParameter)value);

        public override void Remove(object value) => _parameters.Remove((DbParameter)value);

        public override void RemoveAt(int index) => _parameters.RemoveAt(index);

        public override void RemoveAt(string parameterName) => _parameters.RemoveAt(IndexOf(parameterName));

        protected override DbParameter GetParameter(int index) => _parameters[index];

        protected override DbParameter GetParameter(string parameterName) => _parameters[IndexOf(parameterName)];

        protected override void SetParameter(int index, DbParameter value) => _parameters[index] = value;

        protected override void SetParameter(string parameterName, DbParameter value) =>
            _parameters[IndexOf(parameterName)] = value;
    }

    private sealed class FakeReader(string[] columns, IReadOnlyList<object[]> rows) : DbDataReader
    {
        private int _index = -1;

        private object[] Current => rows[_index];

        public override object this[int ordinal] => GetValue(ordinal);

        public override object this[string name] => GetValue(GetOrdinal(name));

        public override int Depth => 0;

        public override int FieldCount => columns.Length;

        public override bool HasRows => rows.Count > 0;

        public override bool IsClosed => false;

        public override int RecordsAffected => 0;

        public override bool Read() => ++_index < rows.Count;

        public override bool NextResult() => false;

        public override bool GetBoolean(int ordinal) => (bool)Current[ordinal];

        public override byte GetByte(int ordinal) => (byte)Current[ordinal];

        public override long GetBytes(int ordinal, long dataOffset, byte[]? buffer, int bufferOffset, int length) =>
            throw new NotSupportedException();

        public override char GetChar(int ordinal) => (char)Current[ordinal];

        public override long GetChars(int ordinal, long dataOffset, char[]? buffer, int bufferOffset, int length) =>
            throw new NotSupportedException();

        public override string GetDataTypeName(int ordinal) => GetFieldType(ordinal).Name;

        public override DateTime GetDateTime(int ordinal) => (DateTime)Current[ordinal];

        public override decimal GetDecimal(int ordinal) => (decimal)Current[ordinal];

        public override double GetDouble(int ordinal) => (double)Current[ordinal];

        public override Type GetFieldType(int ordinal) => Current[ordinal].GetType();

        public override float GetFloat(int ordinal) => (float)Current[ordinal];

        public override Guid GetGuid(int ordinal) => (Guid)Current[ordinal];

        public override short GetInt16(int ordinal) => (short)Current[ordinal];

        public override int GetInt32(int ordinal) => (int)Current[ordinal];

        public override long GetInt64(int ordinal) => (long)Current[ordinal];

        public override string GetName(int ordinal) => columns[ordinal];

        public override int GetOrdinal(string name) => Array.IndexOf(columns, name);

        public override string GetString(int ordinal) => (string)Current[ordinal];

        public override object GetValue(int ordinal) => Current[ordinal];

        public override int GetValues(object[] values)
        {
            var count = Math.Min(values.Length, columns.Length);
            Array.Copy(Current, values, count);
            return count;
        }

        public override bool IsDBNull(int ordinal) => Current[ordinal] is null or DBNull;

        public override IEnumerator GetEnumerator() => rows.GetEnumerator();
    }
}
