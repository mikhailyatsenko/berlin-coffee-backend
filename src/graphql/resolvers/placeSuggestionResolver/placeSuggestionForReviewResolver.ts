import PlaceSuggestion, {
  IPlaceSuggestion,
} from "../../../models/PlaceSuggestion.js";
import { requireSuggestionForReview } from "../../../utils/placeSuggestionToken.js";

/** Enough to spot duplicates; the admin is not paging through them. */
const MAX_SIMILAR = 10;

/** Case-insensitive substring, either way round: "Bonanza" and "Bonanza Coffee Heroes" are alike. */
const areSimilar = (a: string, b: string) => {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  return x.includes(y) || y.includes(x);
};

async function similarPending(suggestion: IPlaceSuggestion) {
  // Pending suggestions are few (the admin clears them), so comparing in code
  // beats a query that has to get case-folding right for non-ASCII names.
  const others = await PlaceSuggestion.find(
    { status: "pending", _id: { $ne: suggestion._id } },
    { name: 1, address: 1 },
  )
    .sort({ createdAt: 1 })
    .lean();

  return others
    .filter((other) => areSimilar(other.name, suggestion.name))
    .slice(0, MAX_SIMILAR)
    .map((other) => ({
      id: other._id.toString(),
      name: other.name,
      address: other.address,
    }));
}

export async function placeSuggestionForReviewResolver(
  _: never,
  { id, token }: { id: string; token: string },
) {
  const suggestion = await requireSuggestionForReview(id, token);

  // Written field by field: the Guest's email must never reach this response.
  return {
    id: suggestion.id,
    name: suggestion.name,
    address: suggestion.address,
    description: suggestion.description ?? null,
    instagram: suggestion.instagram ?? null,
    suggestedBy: suggestion.userId ? ("user" as const) : ("guest" as const),
    status: suggestion.status,
    publishedPlaceId: suggestion.publishedPlaceId?.toString() ?? null,
    // Photos arrive with ticket 03.
    photos: [] as string[],
    similarPending: await similarPending(suggestion),
  };
}
