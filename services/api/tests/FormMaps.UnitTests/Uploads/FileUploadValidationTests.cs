using System.Text;
using FormMaps.Application.Uploads;

namespace FormMaps.UnitTests.Uploads;

/// <summary>
/// Pure upload helpers (FM-DOTNET-088) — parity with lib/fileValidation.ts (validateMagicBytes), lib/sanitize.ts
/// (sanitizeFilename), and the routes/upload.ts inline CSV parse. Pins the magic-byte table per declared type, the
/// text-format always-pass + &lt;4-byte fail, the path-strip / non-word replace / 255-cap sanitizer, and the CSV
/// header/row shaping (lowercased keys, short-row key omission, dup-header last-wins, quote stripping).
/// </summary>
public sealed class FileUploadValidationTests
{
    private static byte[] Bytes(params int[] b) => b.Select(x => (byte)x).ToArray();

    [Fact]
    public void Png_signature_matches_image_png() =>
        Assert.True(FileUploadValidation.ValidateMagicBytes(Bytes(0x89, 0x50, 0x4e, 0x47, 0x0d), "image/png"));

    [Fact]
    public void Png_declared_but_wrong_bytes_fails() =>
        Assert.False(FileUploadValidation.ValidateMagicBytes(Bytes(0x00, 0x01, 0x02, 0x03), "image/png"));

    [Fact]
    public void Jpeg_signature_matches() =>
        Assert.True(FileUploadValidation.ValidateMagicBytes(Bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg"));

    [Fact]
    public void Webp_riff_matches() =>
        Assert.True(FileUploadValidation.ValidateMagicBytes(Encoding.ASCII.GetBytes("RIFF....WEBP"), "image/webp"));

    [Fact]
    public void Gif_matches() =>
        Assert.True(FileUploadValidation.ValidateMagicBytes(Encoding.ASCII.GetBytes("GIF89a"), "image/gif"));

    [Fact]
    public void Pdf_matches() =>
        Assert.True(FileUploadValidation.ValidateMagicBytes(Encoding.ASCII.GetBytes("%PDF-1.7"), "application/pdf"));

    [Fact]
    public void Docx_zip_signature_matches_officedocument() =>
        Assert.True(FileUploadValidation.ValidateMagicBytes(Bytes(0x50, 0x4b, 0x03, 0x04),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));

    [Fact]
    public void Doc_ole_signature_matches_msword() =>
        Assert.True(FileUploadValidation.ValidateMagicBytes(Bytes(0xd0, 0xcf, 0x11, 0xe0), "application/msword"));

    [Theory]
    [InlineData("image/svg+xml")]
    [InlineData("text/csv")]
    [InlineData("text/plain")]
    public void Text_formats_always_pass_when_at_least_4_bytes(string mimetype) =>
        Assert.True(FileUploadValidation.ValidateMagicBytes(Bytes(0x3c, 0x3f, 0x78, 0x6d), mimetype));

    [Fact]
    public void Under_four_bytes_always_fails_even_for_text() =>
        Assert.False(FileUploadValidation.ValidateMagicBytes(Bytes(0x3c, 0x3f, 0x78), "text/plain"));

    [Fact]
    public void Wrong_type_for_png_bytes_fails() =>
        Assert.False(FileUploadValidation.ValidateMagicBytes(Bytes(0x89, 0x50, 0x4e, 0x47), "application/pdf"));

    // ---- sanitizeFilename ----

    [Theory]
    [InlineData("photo.png", "photo.png")]
    [InlineData("../../etc/passwd", "passwd")]
    [InlineData("dir\\sub\\file.txt", "file.txt")]
    [InlineData("my file (1).png", "my_file__1_.png")]
    [InlineData("résumé.pdf", "r_sum_.pdf")] // non-ASCII é → "_" (ECMAScript \w is ASCII)
    public void Sanitize_filename(string input, string expected) =>
        Assert.Equal(expected, FileUploadValidation.SanitizeFilename(input));

    [Fact]
    public void Sanitize_caps_at_255_chars() =>
        Assert.Equal(255, FileUploadValidation.SanitizeFilename(new string('a', 300)).Length);

    // ---- CSV parse ----

    [Fact]
    public void Csv_headers_and_rows_lowercased_keys()
    {
        var parsed = FileUploadValidation.ParseCsv("Code,Name\nMATH101,Algebra\nSCI102,Biology");

        Assert.Equal(["Code", "Name"], parsed.Headers);
        Assert.Equal(2, parsed.Rows.Count);
        Assert.Equal("MATH101", parsed.Rows[0]["code"]);
        Assert.Equal("Algebra", parsed.Rows[0]["name"]);
        Assert.Equal("Biology", parsed.Rows[1]["name"]);
    }

    [Fact]
    public void Csv_quoted_cells_are_dequoted_and_trimmed()
    {
        var parsed = FileUploadValidation.ParseCsv("\"Code\" , \"Name\"\n\"A1\",\" Intro \"");

        Assert.Equal(["Code", "Name"], parsed.Headers); // outer space is outside the quotes → trimmed away
        Assert.Equal("A1", parsed.Rows[0]["code"]);
        Assert.Equal(" Intro ", parsed.Rows[0]["name"]); // spaces INSIDE the quotes survive (trim acts before dequote)
    }

    [Fact]
    public void Csv_short_row_omits_missing_trailing_keys()
    {
        var parsed = FileUploadValidation.ParseCsv("a,b,c\n1,2");

        Assert.True(parsed.Rows[0].ContainsKey("a"));
        Assert.True(parsed.Rows[0].ContainsKey("b"));
        Assert.False(parsed.Rows[0].ContainsKey("c")); // values[2] undefined → key dropped
    }

    [Fact]
    public void Csv_duplicate_lowercased_headers_last_value_wins()
    {
        var parsed = FileUploadValidation.ParseCsv("Name,name\nfirst,second");
        Assert.Equal("second", parsed.Rows[0]["name"]);
    }

    [Fact]
    public void Csv_duplicate_header_over_short_row_drops_the_key()
    {
        // Node: forEach assigns row["name"]=values[0]="first" then row["name"]=values[1]=undefined → JSON drops it → {}.
        var parsed = FileUploadValidation.ParseCsv("Name,name\nfirst");
        Assert.False(parsed.Rows[0].ContainsKey("name"));
        Assert.Empty(parsed.Rows[0]);
    }

    [Fact]
    public void Csv_blank_lines_are_dropped()
    {
        var parsed = FileUploadValidation.ParseCsv("a,b\n\n   \n1,2\n");
        Assert.Single(parsed.Rows);
        Assert.Equal("1", parsed.Rows[0]["a"]);
    }

    [Fact]
    public void Csv_empty_content_yields_no_headers_or_rows()
    {
        var parsed = FileUploadValidation.ParseCsv("   \n  ");
        Assert.Empty(parsed.Headers);
        Assert.Empty(parsed.Rows);
    }
}
