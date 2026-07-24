using FormMaps.Application.Auth;

namespace FormMaps.Application.College;

/// <summary>
/// College essays + comments (FM-DOTNET-083 — routes/college.ts Feature 3, mounted /api/v1/college). Essays are
/// cross-user scoped (gated by <see cref="ICollegeAccessResolver"/> at the endpoint): list (with the UNFILTERED comment
/// count), create, presence-aware update, soft-delete. Comments hang off an essay (its owner gates access): add + list
/// (with the nested author {id,name,roleName}). Reads on a read-only RLS session; writes on a writable session + commit.
/// </summary>
public interface ICollegeEssaysRepository
{
    /// <summary>The student's active essays + comment count (Prisma _count.comments, UNFILTERED), createdDate DESC
    /// (+ id tie-break).</summary>
    Task<IReadOnlyList<EssayListRow>> ListEssaysAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>Fixed-column INSERT of a new essay (mass-assignment guard); returns the full row.</summary>
    Task<EssayRow> CreateEssayAsync(
        RequestContext context, string callerId, EssayCreateInput input, CancellationToken cancellationToken = default);

    /// <summary>The studentId owner of an ACTIVE essay (findUnique { id, isActive:true }), or null (→ 404 "Essay not
    /// found"). Reused by PUT/DELETE and the comment routes.</summary>
    Task<string?> FindActiveEssayOwnerAsync(
        RequestContext context, string id, CancellationToken cancellationToken = default);

    /// <summary>Apply the present-fields essay update (existence + access already gated). Returns the full row.</summary>
    Task<EssayRow> ApplyEssayUpdateAsync(
        RequestContext context, string callerId, string id, EssayUpdateFields fields,
        CancellationToken cancellationToken = default);

    /// <summary>Soft-delete (isActive=false) by id (existence + access already gated).</summary>
    Task SoftDeleteEssayAsync(
        RequestContext context, string callerId, string id, CancellationToken cancellationToken = default);

    /// <summary>Insert a comment (essayId + authorId=caller + content); returns the full row.</summary>
    Task<CommentRow> AddCommentAsync(
        RequestContext context, string essayId, string authorId, string content,
        CancellationToken cancellationToken = default);

    /// <summary>The essay's active comments + nested author {id,name,roleName}, createdDate ASC (+ id tie-break).</summary>
    Task<IReadOnlyList<CommentWithAuthor>> ListCommentsAsync(
        RequestContext context, string essayId, CancellationToken cancellationToken = default);
}
