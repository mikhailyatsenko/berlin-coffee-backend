import type { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import type { Context } from '../context.js';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  JSON: { input: any; output: any; }
};

export type AddRatingResponse = {
  __typename?: 'AddRatingResponse';
  averageRating: Scalars['Float']['output'];
  ratingCount: Scalars['Int']['output'];
  reviewId: Scalars['String']['output'];
  userRating: Scalars['Int']['output'];
};

export type AddTextReviewResponse = {
  __typename?: 'AddTextReviewResponse';
  reviewId: Scalars['String']['output'];
  text: Scalars['String']['output'];
};

export type AdditionalInfoTagsResponse = {
  __typename?: 'AdditionalInfoTagsResponse';
  tags: Array<Scalars['String']['output']>;
};

export type AuthPayload = {
  __typename?: 'AuthPayload';
  emailChanged?: Maybe<Scalars['Boolean']['output']>;
  isFirstLogin?: Maybe<Scalars['Boolean']['output']>;
  user: User;
};

export type AvailableNeighborhoodsResponse = {
  __typename?: 'AvailableNeighborhoodsResponse';
  neighborhoods: Array<Scalars['String']['output']>;
  total: Scalars['Int']['output'];
};

export type Characteristic =
  | 'affordablePrices'
  | 'deliciousFilterCoffee'
  | 'freeWifi'
  | 'friendlyStaff'
  | 'outdoorSeating'
  | 'petFriendly'
  | 'pleasantAtmosphere'
  | 'yummyEats';

export type CharacteristicCounts = {
  __typename?: 'CharacteristicCounts';
  affordablePrices: CharacteristicData;
  deliciousFilterCoffee: CharacteristicData;
  freeWifi: CharacteristicData;
  friendlyStaff: CharacteristicData;
  outdoorSeating: CharacteristicData;
  petFriendly: CharacteristicData;
  pleasantAtmosphere: CharacteristicData;
  yummyEats: CharacteristicData;
};

export type CharacteristicData = {
  __typename?: 'CharacteristicData';
  count: Scalars['Int']['output'];
  pressed: Scalars['Boolean']['output'];
};

export type ClaimGuestReviewsResponse = {
  __typename?: 'ClaimGuestReviewsResponse';
  claimedCount: Scalars['Int']['output'];
  /**
   * Guest reviews left behind because the account already has a review for that
   * place. They stay anonymous rather than overwriting anything.
   */
  conflictedCount: Scalars['Int']['output'];
};

export type ContactForm = {
  __typename?: 'ContactForm';
  email: Scalars['String']['output'];
  message: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type ContactFormResponse = {
  __typename?: 'ContactFormResponse';
  name: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
};

export type CoordinatesInput = {
  lat: Scalars['Float']['input'];
  lng: Scalars['Float']['input'];
};

export type DeleteReviewResult = {
  __typename?: 'DeleteReviewResult';
  averageRating: Scalars['Float']['output'];
  ratingCount: Scalars['Int']['output'];
  reviewId: Scalars['ID']['output'];
};

export type FavoritePlace = {
  __typename?: 'FavoritePlace';
  address: Scalars['String']['output'];
  averageRating?: Maybe<Scalars['Float']['output']>;
  googleId?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  image: Scalars['String']['output'];
  instagram: Scalars['String']['output'];
  isFavorite: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  neighborhood?: Maybe<Scalars['String']['output']>;
};

export type FavoritePlacesResponse = {
  __typename?: 'FavoritePlacesResponse';
  places: Array<FavoritePlace>;
  total: Scalars['Int']['output'];
};

export type Geometry = {
  __typename?: 'Geometry';
  coordinates: Array<Scalars['Float']['output']>;
  type: Scalars['String']['output'];
};

/**
 * A Google Place ID candidate for a suggestion, from the free "IDs Only" Text
 * Search. existingPlaceId is set when a Place already carries this ID.
 */
export type GoogleIdCandidate = {
  __typename?: 'GoogleIdCandidate';
  existingPlaceId?: Maybe<Scalars['ID']['output']>;
  googleId: Scalars['String']['output'];
};

/**
 * Credentials issued once after a successful captcha check. The client stores both
 * values in localStorage; the raw secret is never returned again.
 */
export type GuestIdentityPayload = {
  __typename?: 'GuestIdentityPayload';
  guestId: Scalars['String']['output'];
  guestSecret: Scalars['String']['output'];
};

export type LogoutResponse = {
  __typename?: 'LogoutResponse';
  message: Scalars['String']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  addRating: AddRatingResponse;
  addTextReview: AddTextReviewResponse;
  /** Attaches reviews left as a guest to the currently signed-in account. */
  claimGuestReviews: ClaimGuestReviewsResponse;
  confirmEmail: AuthPayload;
  contactForm: ContactFormResponse;
  /**
   * Issues a guest identity after a captcha check. This is the only place a guest
   * captcha is verified; every later guest action authenticates with the secret.
   */
  createGuestIdentity: GuestIdentityPayload;
  deleteAccount: SuccessResponse;
  deleteAvatar: SuccessResponse;
  /**
   * Deletes one photo of a Place suggestion, the suggester's or the admin's,
   * authorized only by the review link's token. The path must sit in this
   * suggestion's own ImageKit folder; a path already gone still succeeds, so a
   * retried delete is safe.
   */
  deletePlaceSuggestionPhoto: Scalars['Boolean']['output'];
  deleteReview: DeleteReviewResult;
  loginWithGoogle?: Maybe<AuthPayload>;
  logout?: Maybe<LogoutResponse>;
  /**
   * Publishes a Place suggestion as a new Place and emails the suggester. A
   * repeat call changes nothing and returns the outcome already decided; a bad
   * token fails like every admin operation (ADR 0002 in the frontend repo).
   */
  publishPlaceSuggestion: PlaceSuggestionOutcome;
  refreshToken: RefreshTokenResponse;
  registerUser: SuccessResponse;
  /** Rejects a Place suggestion. A repeat call changes nothing. */
  rejectPlaceSuggestion: PlaceSuggestionOutcome;
  reportInaccuracy: ReportInaccuracyResponse;
  requestPasswordReset: SuccessResponse;
  resendConfirmationEmail: SuccessResponse;
  resetPassword: SuccessResponse;
  setNewPassword: SuccessResponse;
  signInWithEmail: AuthPayload;
  /** Returns the id of the new suggestion. */
  submitPlaceSuggestion: Scalars['ID']['output'];
  toggleCharacteristic: SuccessResponse;
  toggleFavorite: Scalars['Boolean']['output'];
  updatePersonalData: SuccessResponse;
  uploadAvatar: UploadAvatarResponse;
  /**
   * Attaches one photo to a Place suggestion. Only the suggester, only while
   * `pending`, at most 10; Guests count towards the existing Guest photo limit.
   * Returns the new photo count.
   */
  uploadPlaceSuggestionPhoto: UploadPlaceSuggestionPhotoResponse;
  /**
   * Attaches one photo to a Place suggestion as the admin, authorized only by
   * the review link's token (ADR 0002 in the frontend repo) rather than
   * ownership. Same rules as uploadPlaceSuggestionPhoto (pending only, the same
   * shared 10-photo cap) but no rate limit. Returns the new photo's own path.
   */
  uploadPlaceSuggestionPhotoAsAdmin: Scalars['String']['output'];
  uploadReviewImage: UploadReviewImageResponse;
  validatePasswordResetToken: SuccessResponse;
};


export type MutationAddRatingArgs = {
  guestId?: InputMaybe<Scalars['String']['input']>;
  guestSecret?: InputMaybe<Scalars['String']['input']>;
  placeId: Scalars['ID']['input'];
  rating: Scalars['Float']['input'];
};


export type MutationAddTextReviewArgs = {
  guestId?: InputMaybe<Scalars['String']['input']>;
  guestSecret?: InputMaybe<Scalars['String']['input']>;
  placeId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
};


export type MutationClaimGuestReviewsArgs = {
  guestId: Scalars['String']['input'];
  guestSecret: Scalars['String']['input'];
};


export type MutationConfirmEmailArgs = {
  email: Scalars['String']['input'];
  token: Scalars['String']['input'];
};


export type MutationContactFormArgs = {
  captchaToken?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
  message: Scalars['String']['input'];
  name: Scalars['String']['input'];
};


export type MutationCreateGuestIdentityArgs = {
  captchaToken?: InputMaybe<Scalars['String']['input']>;
};


export type MutationDeletePlaceSuggestionPhotoArgs = {
  id: Scalars['ID']['input'];
  path: Scalars['String']['input'];
  token: Scalars['String']['input'];
};


export type MutationDeleteReviewArgs = {
  deleteOptions: Scalars['String']['input'];
  reviewId: Scalars['ID']['input'];
};


export type MutationLoginWithGoogleArgs = {
  code: Scalars['String']['input'];
};


export type MutationPublishPlaceSuggestionArgs = {
  id: Scalars['ID']['input'];
  input: PublishPlaceSuggestionInput;
  token: Scalars['String']['input'];
};


export type MutationRegisterUserArgs = {
  captchaToken?: InputMaybe<Scalars['String']['input']>;
  displayName: Scalars['String']['input'];
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};


export type MutationRejectPlaceSuggestionArgs = {
  id: Scalars['ID']['input'];
  token: Scalars['String']['input'];
};


export type MutationReportInaccuracyArgs = {
  captchaToken?: InputMaybe<Scalars['String']['input']>;
  message: Scalars['String']['input'];
  placeId: Scalars['String']['input'];
  placeName: Scalars['String']['input'];
};


export type MutationRequestPasswordResetArgs = {
  captchaToken?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
};


export type MutationResendConfirmationEmailArgs = {
  captchaToken?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
};


export type MutationResetPasswordArgs = {
  email: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
  token: Scalars['String']['input'];
};


export type MutationSetNewPasswordArgs = {
  newPassword: Scalars['String']['input'];
  oldPassword?: InputMaybe<Scalars['String']['input']>;
  userId: Scalars['ID']['input'];
};


export type MutationSignInWithEmailArgs = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};


export type MutationSubmitPlaceSuggestionArgs = {
  guestId?: InputMaybe<Scalars['String']['input']>;
  guestSecret?: InputMaybe<Scalars['String']['input']>;
  input: PlaceSuggestionInput;
};


export type MutationToggleCharacteristicArgs = {
  characteristic: Characteristic;
  guestId?: InputMaybe<Scalars['String']['input']>;
  guestSecret?: InputMaybe<Scalars['String']['input']>;
  placeId: Scalars['ID']['input'];
};


export type MutationToggleFavoriteArgs = {
  placeId: Scalars['ID']['input'];
};


export type MutationUpdatePersonalDataArgs = {
  displayName?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  userId: Scalars['ID']['input'];
};


export type MutationUploadAvatarArgs = {
  fileBuffer: Scalars['String']['input'];
  fileName: Scalars['String']['input'];
  userId: Scalars['ID']['input'];
};


export type MutationUploadPlaceSuggestionPhotoArgs = {
  fileBuffer: Scalars['String']['input'];
  guestId?: InputMaybe<Scalars['String']['input']>;
  guestSecret?: InputMaybe<Scalars['String']['input']>;
  suggestionId: Scalars['ID']['input'];
};


export type MutationUploadPlaceSuggestionPhotoAsAdminArgs = {
  fileBuffer: Scalars['String']['input'];
  id: Scalars['ID']['input'];
  token: Scalars['String']['input'];
};


export type MutationUploadReviewImageArgs = {
  fileBuffer: Scalars['String']['input'];
  guestId?: InputMaybe<Scalars['String']['input']>;
  guestSecret?: InputMaybe<Scalars['String']['input']>;
  reviewId: Scalars['ID']['input'];
};


export type MutationValidatePasswordResetTokenArgs = {
  email: Scalars['String']['input'];
  token: Scalars['String']['input'];
};

export type OpeningHour = {
  __typename?: 'OpeningHour';
  day: Scalars['String']['output'];
  hours: Scalars['String']['output'];
};

export type Place = {
  __typename?: 'Place';
  geometry: Geometry;
  id: Scalars['ID']['output'];
  properties: PlaceProperties;
  type: Scalars['String']['output'];
};

export type PlaceProperties = {
  __typename?: 'PlaceProperties';
  additionalInfo?: Maybe<Scalars['JSON']['output']>;
  address: Scalars['String']['output'];
  averageRating?: Maybe<Scalars['Float']['output']>;
  /** How many Reviews marked each Characteristic. Filled by place only, null elsewhere. */
  characteristicCounts?: Maybe<CharacteristicCounts>;
  description: Scalars['String']['output'];
  favoriteCount: Scalars['Int']['output'];
  googleId?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  image: Scalars['String']['output'];
  images?: Maybe<Array<Scalars['String']['output']>>;
  instagram: Scalars['String']['output'];
  isFavorite: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  neighborhood?: Maybe<Scalars['String']['output']>;
  openingHours?: Maybe<Array<OpeningHour>>;
  /** The Characteristics the caller marked in their own Review. Filled by filteredPlaces and neighborhoodShortlists only, null elsewhere. */
  ownCharacteristics?: Maybe<Array<Characteristic>>;
  /** The caller's own Rating (User or Guest). Filled by filteredPlaces and neighborhoodShortlists only, null elsewhere. */
  ownRating?: Maybe<Scalars['Int']['output']>;
  phone?: Maybe<Scalars['String']['output']>;
  ratingCount: Scalars['Int']['output'];
  /** The Shortlists whose Amenities the Place has, in Shortlist order; the Shortlists' Average rating threshold does not apply. Filled by filteredPlaces and neighborhoodShortlists only, empty elsewhere. */
  shortlistIds: Array<ShortlistId>;
  website?: Maybe<Scalars['String']['output']>;
};

export type PlaceReviews = {
  __typename?: 'PlaceReviews';
  id: Scalars['ID']['output'];
  reviews: Array<Review>;
};

export type PlaceSuggester =
  | 'guest'
  | 'user';

/** What the admin sees on the review page. Never carries the Guest's email. */
export type PlaceSuggestionForReview = {
  __typename?: 'PlaceSuggestionForReview';
  address: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  instagram?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  /** Paths of the photos sent with the suggestion. */
  photos: Array<Scalars['String']['output']>;
  /** Set once the suggestion is published. */
  publishedPlaceId?: Maybe<Scalars['ID']['output']>;
  /** Other pending suggestions with a similar name. */
  similarPending: Array<SimilarPlaceSuggestion>;
  status: PlaceSuggestionStatus;
  suggestedBy: PlaceSuggester;
};

/**
 * Text is trimmed; a blank optional field counts as missing. Longer input fails
 * with BAD_USER_INPUT.
 */
export type PlaceSuggestionInput = {
  /** Required, at most 300 characters. */
  address: Scalars['String']['input'];
  /** At most 500 characters. */
  description?: InputMaybe<Scalars['String']['input']>;
  /**
   * Where to tell a Guest that their Place was added. Ignored for signed-in
   * Users, whose account email is used instead. At most 254 characters and must
   * look like an email.
   */
  email?: InputMaybe<Scalars['String']['input']>;
  /** At most 200 characters. */
  instagram?: InputMaybe<Scalars['String']['input']>;
  /** Required, at most 200 characters. */
  name: Scalars['String']['input'];
};

/** What Publish or Reject return: the outcome just decided, or, on a repeat call, the one already decided. */
export type PlaceSuggestionOutcome = {
  __typename?: 'PlaceSuggestionOutcome';
  /** Set once the suggestion is published. */
  publishedPlaceId?: Maybe<Scalars['ID']['output']>;
  status: PlaceSuggestionStatus;
};

export type PlaceSuggestionStatus =
  | 'pending'
  | 'published'
  | 'rejected';

export type PlacesResponse = {
  __typename?: 'PlacesResponse';
  places: Array<Place>;
  total: Scalars['Int']['output'];
};

/**
 * What Publish needs to complete the Place. Text is trimmed; a blank optional
 * field counts as missing.
 */
export type PublishPlaceSuggestionInput = {
  /** Required. */
  address: Scalars['String']['input'];
  /** Required, inside Berlin's bounding box (lat 52.33–52.68, lng 13.08–13.77). */
  coordinates: CoordinatesInput;
  description?: InputMaybe<Scalars['String']['input']>;
  /**
   * Fails Publish with DUPLICATE_GOOGLE_PLACE_ID if it already belongs to a
   * Place; the existing Place's id is the last word of the error message.
   */
  googlePlaceId?: InputMaybe<Scalars['String']['input']>;
  instagram?: InputMaybe<Scalars['String']['input']>;
  /** Required. */
  name: Scalars['String']['input'];
  /** Required, one of the twelve Berlin Neighborhoods, in the spelling Places use. */
  neighborhood: Scalars['String']['input'];
  phone?: InputMaybe<Scalars['String']['input']>;
  /**
   * Paths of the suggestion's photos to keep, in upload order; must belong to
   * this suggestion. The first becomes the Place's card image; the rest are
   * deleted.
   */
  photoPaths?: InputMaybe<Array<Scalars['String']['input']>>;
  website?: InputMaybe<Scalars['String']['input']>;
};

export type Query = {
  __typename?: 'Query';
  availableAdditionalInfoTags: AdditionalInfoTagsResponse;
  availableNeighborhoods: AvailableNeighborhoodsResponse;
  currentUser?: Maybe<User>;
  favoritePlaces: Array<FavoritePlace>;
  filteredPlaces: PlacesResponse;
  /**
   * Up to three Google Place ID candidates for a suggestion, free ("IDs Only"
   * Text Search). A bad token fails like every other admin operation.
   */
  findGoogleIdsForSuggestion: Array<GoogleIdCandidate>;
  neighborhoodShortlists: Array<Shortlist>;
  place: Place;
  placeReviews: PlaceReviews;
  /**
   * Opens a Place suggestion from the admin's review link. The token is the only
   * authorization; a wrong token and an unknown id fail the same way.
   */
  placeSuggestionForReview: PlaceSuggestionForReview;
  places: PlacesResponse;
  userReviewActivity: Array<UserReviewActivity>;
};


export type QueryFilteredPlacesArgs = {
  additionalInfo?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  minRating?: InputMaybe<Scalars['Float']['input']>;
  neighborhood?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};


export type QueryFindGoogleIdsForSuggestionArgs = {
  id: Scalars['ID']['input'];
  token: Scalars['String']['input'];
};


export type QueryNeighborhoodShortlistsArgs = {
  neighborhood: Scalars['String']['input'];
};


export type QueryPlaceArgs = {
  placeId: Scalars['ID']['input'];
};


export type QueryPlaceReviewsArgs = {
  placeId: Scalars['ID']['input'];
};


export type QueryPlaceSuggestionForReviewArgs = {
  id: Scalars['ID']['input'];
  token: Scalars['String']['input'];
};


export type QueryPlacesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};

export type RefreshTokenResponse = {
  __typename?: 'RefreshTokenResponse';
  accessToken: Scalars['String']['output'];
  user: User;
};

export type ReportInaccuracyResponse = {
  __typename?: 'ReportInaccuracyResponse';
  placeName: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
};

export type Review = {
  __typename?: 'Review';
  characteristics?: Maybe<Array<Characteristic>>;
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isGoogleReview: Scalars['Boolean']['output'];
  isOwnReview: Scalars['Boolean']['output'];
  placeId: Scalars['ID']['output'];
  reviewImages: Scalars['Int']['output'];
  text?: Maybe<Scalars['String']['output']>;
  userAvatar?: Maybe<Scalars['String']['output']>;
  /** Null for guest reviews, which have no account behind them. */
  userId?: Maybe<Scalars['ID']['output']>;
  userName: Scalars['String']['output'];
  userRating?: Maybe<Scalars['Float']['output']>;
};

export type Shortlist = {
  __typename?: 'Shortlist';
  /** Canonical Amenity names, for the map's Filters. */
  amenities: Array<Scalars['String']['output']>;
  id: ShortlistId;
  /** Top 5 by Average rating. */
  places: Array<Place>;
  /** All Places that qualify. */
  total: Scalars['Int']['output'];
};

export type ShortlistId =
  | 'breakfastBrunch'
  | 'dogFriendly'
  | 'outdoorSeating'
  | 'work';

export type SimilarPlaceSuggestion = {
  __typename?: 'SimilarPlaceSuggestion';
  address: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
};

export type SuccessResponse = {
  __typename?: 'SuccessResponse';
  pendingEmail?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type UploadAvatarResponse = {
  __typename?: 'UploadAvatarResponse';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  fileId?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type UploadPlaceSuggestionPhotoResponse = {
  __typename?: 'UploadPlaceSuggestionPhotoResponse';
  /** Number of photos stored for the suggestion after this upload. */
  photoCount: Scalars['Int']['output'];
};

export type UploadReviewImageResponse = {
  __typename?: 'UploadReviewImageResponse';
  /** Number of images stored for the review after this upload. */
  reviewImages: Scalars['Int']['output'];
};

export type User = {
  __typename?: 'User';
  avatar?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isGoogleUserUserWithoutPassword: Scalars['Boolean']['output'];
  lastActive?: Maybe<Scalars['String']['output']>;
};

export type UserReviewActivity = {
  __typename?: 'UserReviewActivity';
  averageRating?: Maybe<Scalars['Float']['output']>;
  createdAt: Scalars['String']['output'];
  placeId: Scalars['ID']['output'];
  placeName: Scalars['String']['output'];
  rating?: Maybe<Scalars['Int']['output']>;
  reviewText?: Maybe<Scalars['String']['output']>;
};



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  AddRatingResponse: ResolverTypeWrapper<AddRatingResponse>;
  AddTextReviewResponse: ResolverTypeWrapper<AddTextReviewResponse>;
  AdditionalInfoTagsResponse: ResolverTypeWrapper<AdditionalInfoTagsResponse>;
  AuthPayload: ResolverTypeWrapper<AuthPayload>;
  AvailableNeighborhoodsResponse: ResolverTypeWrapper<AvailableNeighborhoodsResponse>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Characteristic: Characteristic;
  CharacteristicCounts: ResolverTypeWrapper<CharacteristicCounts>;
  CharacteristicData: ResolverTypeWrapper<CharacteristicData>;
  ClaimGuestReviewsResponse: ResolverTypeWrapper<ClaimGuestReviewsResponse>;
  ContactForm: ResolverTypeWrapper<ContactForm>;
  ContactFormResponse: ResolverTypeWrapper<ContactFormResponse>;
  CoordinatesInput: CoordinatesInput;
  DeleteReviewResult: ResolverTypeWrapper<DeleteReviewResult>;
  FavoritePlace: ResolverTypeWrapper<FavoritePlace>;
  FavoritePlacesResponse: ResolverTypeWrapper<FavoritePlacesResponse>;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  Geometry: ResolverTypeWrapper<Geometry>;
  GoogleIdCandidate: ResolverTypeWrapper<GoogleIdCandidate>;
  GuestIdentityPayload: ResolverTypeWrapper<GuestIdentityPayload>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  LogoutResponse: ResolverTypeWrapper<LogoutResponse>;
  Mutation: ResolverTypeWrapper<{}>;
  OpeningHour: ResolverTypeWrapper<OpeningHour>;
  Place: ResolverTypeWrapper<Place>;
  PlaceProperties: ResolverTypeWrapper<PlaceProperties>;
  PlaceReviews: ResolverTypeWrapper<PlaceReviews>;
  PlaceSuggester: PlaceSuggester;
  PlaceSuggestionForReview: ResolverTypeWrapper<PlaceSuggestionForReview>;
  PlaceSuggestionInput: PlaceSuggestionInput;
  PlaceSuggestionOutcome: ResolverTypeWrapper<PlaceSuggestionOutcome>;
  PlaceSuggestionStatus: PlaceSuggestionStatus;
  PlacesResponse: ResolverTypeWrapper<PlacesResponse>;
  PublishPlaceSuggestionInput: PublishPlaceSuggestionInput;
  Query: ResolverTypeWrapper<{}>;
  RefreshTokenResponse: ResolverTypeWrapper<RefreshTokenResponse>;
  ReportInaccuracyResponse: ResolverTypeWrapper<ReportInaccuracyResponse>;
  Review: ResolverTypeWrapper<Review>;
  Shortlist: ResolverTypeWrapper<Shortlist>;
  ShortlistId: ShortlistId;
  SimilarPlaceSuggestion: ResolverTypeWrapper<SimilarPlaceSuggestion>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  SuccessResponse: ResolverTypeWrapper<SuccessResponse>;
  UploadAvatarResponse: ResolverTypeWrapper<UploadAvatarResponse>;
  UploadPlaceSuggestionPhotoResponse: ResolverTypeWrapper<UploadPlaceSuggestionPhotoResponse>;
  UploadReviewImageResponse: ResolverTypeWrapper<UploadReviewImageResponse>;
  User: ResolverTypeWrapper<User>;
  UserReviewActivity: ResolverTypeWrapper<UserReviewActivity>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  AddRatingResponse: AddRatingResponse;
  AddTextReviewResponse: AddTextReviewResponse;
  AdditionalInfoTagsResponse: AdditionalInfoTagsResponse;
  AuthPayload: AuthPayload;
  AvailableNeighborhoodsResponse: AvailableNeighborhoodsResponse;
  Boolean: Scalars['Boolean']['output'];
  CharacteristicCounts: CharacteristicCounts;
  CharacteristicData: CharacteristicData;
  ClaimGuestReviewsResponse: ClaimGuestReviewsResponse;
  ContactForm: ContactForm;
  ContactFormResponse: ContactFormResponse;
  CoordinatesInput: CoordinatesInput;
  DeleteReviewResult: DeleteReviewResult;
  FavoritePlace: FavoritePlace;
  FavoritePlacesResponse: FavoritePlacesResponse;
  Float: Scalars['Float']['output'];
  Geometry: Geometry;
  GoogleIdCandidate: GoogleIdCandidate;
  GuestIdentityPayload: GuestIdentityPayload;
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  JSON: Scalars['JSON']['output'];
  LogoutResponse: LogoutResponse;
  Mutation: {};
  OpeningHour: OpeningHour;
  Place: Place;
  PlaceProperties: PlaceProperties;
  PlaceReviews: PlaceReviews;
  PlaceSuggestionForReview: PlaceSuggestionForReview;
  PlaceSuggestionInput: PlaceSuggestionInput;
  PlaceSuggestionOutcome: PlaceSuggestionOutcome;
  PlacesResponse: PlacesResponse;
  PublishPlaceSuggestionInput: PublishPlaceSuggestionInput;
  Query: {};
  RefreshTokenResponse: RefreshTokenResponse;
  ReportInaccuracyResponse: ReportInaccuracyResponse;
  Review: Review;
  Shortlist: Shortlist;
  SimilarPlaceSuggestion: SimilarPlaceSuggestion;
  String: Scalars['String']['output'];
  SuccessResponse: SuccessResponse;
  UploadAvatarResponse: UploadAvatarResponse;
  UploadPlaceSuggestionPhotoResponse: UploadPlaceSuggestionPhotoResponse;
  UploadReviewImageResponse: UploadReviewImageResponse;
  User: User;
  UserReviewActivity: UserReviewActivity;
};

export type AddRatingResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AddRatingResponse'] = ResolversParentTypes['AddRatingResponse']> = {
  averageRating?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  ratingCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  reviewId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userRating?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AddTextReviewResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AddTextReviewResponse'] = ResolversParentTypes['AddTextReviewResponse']> = {
  reviewId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  text?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AdditionalInfoTagsResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AdditionalInfoTagsResponse'] = ResolversParentTypes['AdditionalInfoTagsResponse']> = {
  tags?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AuthPayloadResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AuthPayload'] = ResolversParentTypes['AuthPayload']> = {
  emailChanged?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  isFirstLogin?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  user?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AvailableNeighborhoodsResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AvailableNeighborhoodsResponse'] = ResolversParentTypes['AvailableNeighborhoodsResponse']> = {
  neighborhoods?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CharacteristicCountsResolvers<ContextType = Context, ParentType extends ResolversParentTypes['CharacteristicCounts'] = ResolversParentTypes['CharacteristicCounts']> = {
  affordablePrices?: Resolver<ResolversTypes['CharacteristicData'], ParentType, ContextType>;
  deliciousFilterCoffee?: Resolver<ResolversTypes['CharacteristicData'], ParentType, ContextType>;
  freeWifi?: Resolver<ResolversTypes['CharacteristicData'], ParentType, ContextType>;
  friendlyStaff?: Resolver<ResolversTypes['CharacteristicData'], ParentType, ContextType>;
  outdoorSeating?: Resolver<ResolversTypes['CharacteristicData'], ParentType, ContextType>;
  petFriendly?: Resolver<ResolversTypes['CharacteristicData'], ParentType, ContextType>;
  pleasantAtmosphere?: Resolver<ResolversTypes['CharacteristicData'], ParentType, ContextType>;
  yummyEats?: Resolver<ResolversTypes['CharacteristicData'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CharacteristicDataResolvers<ContextType = Context, ParentType extends ResolversParentTypes['CharacteristicData'] = ResolversParentTypes['CharacteristicData']> = {
  count?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  pressed?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ClaimGuestReviewsResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ClaimGuestReviewsResponse'] = ResolversParentTypes['ClaimGuestReviewsResponse']> = {
  claimedCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  conflictedCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ContactFormResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ContactForm'] = ResolversParentTypes['ContactForm']> = {
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ContactFormResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ContactFormResponse'] = ResolversParentTypes['ContactFormResponse']> = {
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeleteReviewResultResolvers<ContextType = Context, ParentType extends ResolversParentTypes['DeleteReviewResult'] = ResolversParentTypes['DeleteReviewResult']> = {
  averageRating?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  ratingCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  reviewId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type FavoritePlaceResolvers<ContextType = Context, ParentType extends ResolversParentTypes['FavoritePlace'] = ResolversParentTypes['FavoritePlace']> = {
  address?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  averageRating?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  googleId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  image?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  instagram?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  isFavorite?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  neighborhood?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type FavoritePlacesResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['FavoritePlacesResponse'] = ResolversParentTypes['FavoritePlacesResponse']> = {
  places?: Resolver<Array<ResolversTypes['FavoritePlace']>, ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type GeometryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Geometry'] = ResolversParentTypes['Geometry']> = {
  coordinates?: Resolver<Array<ResolversTypes['Float']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type GoogleIdCandidateResolvers<ContextType = Context, ParentType extends ResolversParentTypes['GoogleIdCandidate'] = ResolversParentTypes['GoogleIdCandidate']> = {
  existingPlaceId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  googleId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type GuestIdentityPayloadResolvers<ContextType = Context, ParentType extends ResolversParentTypes['GuestIdentityPayload'] = ResolversParentTypes['GuestIdentityPayload']> = {
  guestId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  guestSecret?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type LogoutResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['LogoutResponse'] = ResolversParentTypes['LogoutResponse']> = {
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type MutationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  addRating?: Resolver<ResolversTypes['AddRatingResponse'], ParentType, ContextType, RequireFields<MutationAddRatingArgs, 'placeId' | 'rating'>>;
  addTextReview?: Resolver<ResolversTypes['AddTextReviewResponse'], ParentType, ContextType, RequireFields<MutationAddTextReviewArgs, 'placeId' | 'text'>>;
  claimGuestReviews?: Resolver<ResolversTypes['ClaimGuestReviewsResponse'], ParentType, ContextType, RequireFields<MutationClaimGuestReviewsArgs, 'guestId' | 'guestSecret'>>;
  confirmEmail?: Resolver<ResolversTypes['AuthPayload'], ParentType, ContextType, RequireFields<MutationConfirmEmailArgs, 'email' | 'token'>>;
  contactForm?: Resolver<ResolversTypes['ContactFormResponse'], ParentType, ContextType, RequireFields<MutationContactFormArgs, 'email' | 'message' | 'name'>>;
  createGuestIdentity?: Resolver<ResolversTypes['GuestIdentityPayload'], ParentType, ContextType, Partial<MutationCreateGuestIdentityArgs>>;
  deleteAccount?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType>;
  deleteAvatar?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType>;
  deletePlaceSuggestionPhoto?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeletePlaceSuggestionPhotoArgs, 'id' | 'path' | 'token'>>;
  deleteReview?: Resolver<ResolversTypes['DeleteReviewResult'], ParentType, ContextType, RequireFields<MutationDeleteReviewArgs, 'deleteOptions' | 'reviewId'>>;
  loginWithGoogle?: Resolver<Maybe<ResolversTypes['AuthPayload']>, ParentType, ContextType, RequireFields<MutationLoginWithGoogleArgs, 'code'>>;
  logout?: Resolver<Maybe<ResolversTypes['LogoutResponse']>, ParentType, ContextType>;
  publishPlaceSuggestion?: Resolver<ResolversTypes['PlaceSuggestionOutcome'], ParentType, ContextType, RequireFields<MutationPublishPlaceSuggestionArgs, 'id' | 'input' | 'token'>>;
  refreshToken?: Resolver<ResolversTypes['RefreshTokenResponse'], ParentType, ContextType>;
  registerUser?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationRegisterUserArgs, 'displayName' | 'email' | 'password'>>;
  rejectPlaceSuggestion?: Resolver<ResolversTypes['PlaceSuggestionOutcome'], ParentType, ContextType, RequireFields<MutationRejectPlaceSuggestionArgs, 'id' | 'token'>>;
  reportInaccuracy?: Resolver<ResolversTypes['ReportInaccuracyResponse'], ParentType, ContextType, RequireFields<MutationReportInaccuracyArgs, 'message' | 'placeId' | 'placeName'>>;
  requestPasswordReset?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationRequestPasswordResetArgs, 'email'>>;
  resendConfirmationEmail?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationResendConfirmationEmailArgs, 'email'>>;
  resetPassword?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationResetPasswordArgs, 'email' | 'newPassword' | 'token'>>;
  setNewPassword?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationSetNewPasswordArgs, 'newPassword' | 'userId'>>;
  signInWithEmail?: Resolver<ResolversTypes['AuthPayload'], ParentType, ContextType, RequireFields<MutationSignInWithEmailArgs, 'email' | 'password'>>;
  submitPlaceSuggestion?: Resolver<ResolversTypes['ID'], ParentType, ContextType, RequireFields<MutationSubmitPlaceSuggestionArgs, 'input'>>;
  toggleCharacteristic?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationToggleCharacteristicArgs, 'characteristic' | 'placeId'>>;
  toggleFavorite?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationToggleFavoriteArgs, 'placeId'>>;
  updatePersonalData?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationUpdatePersonalDataArgs, 'userId'>>;
  uploadAvatar?: Resolver<ResolversTypes['UploadAvatarResponse'], ParentType, ContextType, RequireFields<MutationUploadAvatarArgs, 'fileBuffer' | 'fileName' | 'userId'>>;
  uploadPlaceSuggestionPhoto?: Resolver<ResolversTypes['UploadPlaceSuggestionPhotoResponse'], ParentType, ContextType, RequireFields<MutationUploadPlaceSuggestionPhotoArgs, 'fileBuffer' | 'suggestionId'>>;
  uploadPlaceSuggestionPhotoAsAdmin?: Resolver<ResolversTypes['String'], ParentType, ContextType, RequireFields<MutationUploadPlaceSuggestionPhotoAsAdminArgs, 'fileBuffer' | 'id' | 'token'>>;
  uploadReviewImage?: Resolver<ResolversTypes['UploadReviewImageResponse'], ParentType, ContextType, RequireFields<MutationUploadReviewImageArgs, 'fileBuffer' | 'reviewId'>>;
  validatePasswordResetToken?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationValidatePasswordResetTokenArgs, 'email' | 'token'>>;
};

export type OpeningHourResolvers<ContextType = Context, ParentType extends ResolversParentTypes['OpeningHour'] = ResolversParentTypes['OpeningHour']> = {
  day?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  hours?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PlaceResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Place'] = ResolversParentTypes['Place']> = {
  geometry?: Resolver<ResolversTypes['Geometry'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  properties?: Resolver<ResolversTypes['PlaceProperties'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PlacePropertiesResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PlaceProperties'] = ResolversParentTypes['PlaceProperties']> = {
  additionalInfo?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  address?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  averageRating?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  characteristicCounts?: Resolver<Maybe<ResolversTypes['CharacteristicCounts']>, ParentType, ContextType>;
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  favoriteCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  googleId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  image?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  images?: Resolver<Maybe<Array<ResolversTypes['String']>>, ParentType, ContextType>;
  instagram?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  isFavorite?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  neighborhood?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  openingHours?: Resolver<Maybe<Array<ResolversTypes['OpeningHour']>>, ParentType, ContextType>;
  ownCharacteristics?: Resolver<Maybe<Array<ResolversTypes['Characteristic']>>, ParentType, ContextType>;
  ownRating?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  phone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  ratingCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  shortlistIds?: Resolver<Array<ResolversTypes['ShortlistId']>, ParentType, ContextType>;
  website?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PlaceReviewsResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PlaceReviews'] = ResolversParentTypes['PlaceReviews']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  reviews?: Resolver<Array<ResolversTypes['Review']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PlaceSuggestionForReviewResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PlaceSuggestionForReview'] = ResolversParentTypes['PlaceSuggestionForReview']> = {
  address?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  instagram?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  photos?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  publishedPlaceId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  similarPending?: Resolver<Array<ResolversTypes['SimilarPlaceSuggestion']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['PlaceSuggestionStatus'], ParentType, ContextType>;
  suggestedBy?: Resolver<ResolversTypes['PlaceSuggester'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PlaceSuggestionOutcomeResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PlaceSuggestionOutcome'] = ResolversParentTypes['PlaceSuggestionOutcome']> = {
  publishedPlaceId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['PlaceSuggestionStatus'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PlacesResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PlacesResponse'] = ResolversParentTypes['PlacesResponse']> = {
  places?: Resolver<Array<ResolversTypes['Place']>, ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  availableAdditionalInfoTags?: Resolver<ResolversTypes['AdditionalInfoTagsResponse'], ParentType, ContextType>;
  availableNeighborhoods?: Resolver<ResolversTypes['AvailableNeighborhoodsResponse'], ParentType, ContextType>;
  currentUser?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  favoritePlaces?: Resolver<Array<ResolversTypes['FavoritePlace']>, ParentType, ContextType>;
  filteredPlaces?: Resolver<ResolversTypes['PlacesResponse'], ParentType, ContextType, Partial<QueryFilteredPlacesArgs>>;
  findGoogleIdsForSuggestion?: Resolver<Array<ResolversTypes['GoogleIdCandidate']>, ParentType, ContextType, RequireFields<QueryFindGoogleIdsForSuggestionArgs, 'id' | 'token'>>;
  neighborhoodShortlists?: Resolver<Array<ResolversTypes['Shortlist']>, ParentType, ContextType, RequireFields<QueryNeighborhoodShortlistsArgs, 'neighborhood'>>;
  place?: Resolver<ResolversTypes['Place'], ParentType, ContextType, RequireFields<QueryPlaceArgs, 'placeId'>>;
  placeReviews?: Resolver<ResolversTypes['PlaceReviews'], ParentType, ContextType, RequireFields<QueryPlaceReviewsArgs, 'placeId'>>;
  placeSuggestionForReview?: Resolver<ResolversTypes['PlaceSuggestionForReview'], ParentType, ContextType, RequireFields<QueryPlaceSuggestionForReviewArgs, 'id' | 'token'>>;
  places?: Resolver<ResolversTypes['PlacesResponse'], ParentType, ContextType, RequireFields<QueryPlacesArgs, 'offset'>>;
  userReviewActivity?: Resolver<Array<ResolversTypes['UserReviewActivity']>, ParentType, ContextType>;
};

export type RefreshTokenResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['RefreshTokenResponse'] = ResolversParentTypes['RefreshTokenResponse']> = {
  accessToken?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  user?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ReportInaccuracyResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ReportInaccuracyResponse'] = ResolversParentTypes['ReportInaccuracyResponse']> = {
  placeName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ReviewResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Review'] = ResolversParentTypes['Review']> = {
  characteristics?: Resolver<Maybe<Array<ResolversTypes['Characteristic']>>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isGoogleReview?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  isOwnReview?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  placeId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  reviewImages?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  text?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  userAvatar?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  userId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  userName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userRating?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ShortlistResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Shortlist'] = ResolversParentTypes['Shortlist']> = {
  amenities?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ShortlistId'], ParentType, ContextType>;
  places?: Resolver<Array<ResolversTypes['Place']>, ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SimilarPlaceSuggestionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SimilarPlaceSuggestion'] = ResolversParentTypes['SimilarPlaceSuggestion']> = {
  address?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SuccessResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SuccessResponse'] = ResolversParentTypes['SuccessResponse']> = {
  pendingEmail?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UploadAvatarResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['UploadAvatarResponse'] = ResolversParentTypes['UploadAvatarResponse']> = {
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fileId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UploadPlaceSuggestionPhotoResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['UploadPlaceSuggestionPhotoResponse'] = ResolversParentTypes['UploadPlaceSuggestionPhotoResponse']> = {
  photoCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UploadReviewImageResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['UploadReviewImageResponse'] = ResolversParentTypes['UploadReviewImageResponse']> = {
  reviewImages?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UserResolvers<ContextType = Context, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = {
  avatar?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  displayName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isGoogleUserUserWithoutPassword?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  lastActive?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UserReviewActivityResolvers<ContextType = Context, ParentType extends ResolversParentTypes['UserReviewActivity'] = ResolversParentTypes['UserReviewActivity']> = {
  averageRating?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  placeId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  placeName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  rating?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  reviewText?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type Resolvers<ContextType = Context> = {
  AddRatingResponse?: AddRatingResponseResolvers<ContextType>;
  AddTextReviewResponse?: AddTextReviewResponseResolvers<ContextType>;
  AdditionalInfoTagsResponse?: AdditionalInfoTagsResponseResolvers<ContextType>;
  AuthPayload?: AuthPayloadResolvers<ContextType>;
  AvailableNeighborhoodsResponse?: AvailableNeighborhoodsResponseResolvers<ContextType>;
  CharacteristicCounts?: CharacteristicCountsResolvers<ContextType>;
  CharacteristicData?: CharacteristicDataResolvers<ContextType>;
  ClaimGuestReviewsResponse?: ClaimGuestReviewsResponseResolvers<ContextType>;
  ContactForm?: ContactFormResolvers<ContextType>;
  ContactFormResponse?: ContactFormResponseResolvers<ContextType>;
  DeleteReviewResult?: DeleteReviewResultResolvers<ContextType>;
  FavoritePlace?: FavoritePlaceResolvers<ContextType>;
  FavoritePlacesResponse?: FavoritePlacesResponseResolvers<ContextType>;
  Geometry?: GeometryResolvers<ContextType>;
  GoogleIdCandidate?: GoogleIdCandidateResolvers<ContextType>;
  GuestIdentityPayload?: GuestIdentityPayloadResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  LogoutResponse?: LogoutResponseResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  OpeningHour?: OpeningHourResolvers<ContextType>;
  Place?: PlaceResolvers<ContextType>;
  PlaceProperties?: PlacePropertiesResolvers<ContextType>;
  PlaceReviews?: PlaceReviewsResolvers<ContextType>;
  PlaceSuggestionForReview?: PlaceSuggestionForReviewResolvers<ContextType>;
  PlaceSuggestionOutcome?: PlaceSuggestionOutcomeResolvers<ContextType>;
  PlacesResponse?: PlacesResponseResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  RefreshTokenResponse?: RefreshTokenResponseResolvers<ContextType>;
  ReportInaccuracyResponse?: ReportInaccuracyResponseResolvers<ContextType>;
  Review?: ReviewResolvers<ContextType>;
  Shortlist?: ShortlistResolvers<ContextType>;
  SimilarPlaceSuggestion?: SimilarPlaceSuggestionResolvers<ContextType>;
  SuccessResponse?: SuccessResponseResolvers<ContextType>;
  UploadAvatarResponse?: UploadAvatarResponseResolvers<ContextType>;
  UploadPlaceSuggestionPhotoResponse?: UploadPlaceSuggestionPhotoResponseResolvers<ContextType>;
  UploadReviewImageResponse?: UploadReviewImageResponseResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
  UserReviewActivity?: UserReviewActivityResolvers<ContextType>;
};

