import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { IUser } from '../../models/User';
import { IPlace } from '../../models/Place';
import { IInteraction } from '../../models/Interaction';
import { Context } from '../../';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
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

export type AuthPayload = {
  __typename?: 'AuthPayload';
  emailChanged?: Maybe<Scalars['Boolean']['output']>;
  isFirstLogin?: Maybe<Scalars['Boolean']['output']>;
  user: User;
};

export enum Characteristic {
  AffordablePrices = 'affordablePrices',
  DeliciousFilterCoffee = 'deliciousFilterCoffee',
  FreeWifi = 'freeWifi',
  FriendlyStaff = 'friendlyStaff',
  OutdoorSeating = 'outdoorSeating',
  PetFriendly = 'petFriendly',
  PleasantAtmosphere = 'pleasantAtmosphere',
  YummyEats = 'yummyEats'
}

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

export type DeleteReviewResult = {
  __typename?: 'DeleteReviewResult';
  averageRating: Scalars['Float']['output'];
  ratingCount: Scalars['Int']['output'];
  reviewId: Scalars['ID']['output'];
};

export type Geometry = {
  __typename?: 'Geometry';
  coordinates: Array<Scalars['Float']['output']>;
  type: Scalars['String']['output'];
};

export type LogoutResponse = {
  __typename?: 'LogoutResponse';
  message: Scalars['String']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  addRating: AddRatingResponse;
  addTextReview: AddTextReviewResponse;
  confirmEmail: AuthPayload;
  contactForm: ContactFormResponse;
  deleteAccount: SuccessResponse;
  deleteAvatar: SuccessResponse;
  deleteReview: DeleteReviewResult;
  loginWithGoogle?: Maybe<AuthPayload>;
  logout?: Maybe<LogoutResponse>;
  registerUser: SuccessResponse;
  resendConfirmationEmail: SuccessResponse;
  setNewPassword: SuccessResponse;
  signInWithEmail: AuthPayload;
  toggleCharacteristic: SuccessResponse;
  toggleFavorite: Scalars['Boolean']['output'];
  updatePersonalData: SuccessResponse;
  uploadAvatar: SuccessResponse;
};


export type MutationAddRatingArgs = {
  placeId: Scalars['ID']['input'];
  rating: Scalars['Float']['input'];
};


export type MutationAddTextReviewArgs = {
  placeId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
};


export type MutationConfirmEmailArgs = {
  email: Scalars['String']['input'];
  token: Scalars['String']['input'];
};


export type MutationContactFormArgs = {
  email: Scalars['String']['input'];
  message: Scalars['String']['input'];
  name: Scalars['String']['input'];
};


export type MutationDeleteReviewArgs = {
  deleteOptions: Scalars['String']['input'];
  reviewId: Scalars['ID']['input'];
};


export type MutationLoginWithGoogleArgs = {
  code: Scalars['String']['input'];
};


export type MutationRegisterUserArgs = {
  displayName: Scalars['String']['input'];
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};


export type MutationResendConfirmationEmailArgs = {
  email: Scalars['String']['input'];
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


export type MutationToggleCharacteristicArgs = {
  characteristic: Characteristic;
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
  fileUrl: Scalars['String']['input'];
  userId: Scalars['ID']['input'];
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
  characteristicCounts: CharacteristicCounts;
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
  phone?: Maybe<Scalars['String']['output']>;
  ratingCount: Scalars['Int']['output'];
  reviews: Array<Review>;
  website?: Maybe<Scalars['String']['output']>;
};

export type PlaceReviews = {
  __typename?: 'PlaceReviews';
  id: Scalars['ID']['output'];
  reviews: Array<Review>;
};

export type PlacesResponse = {
  __typename?: 'PlacesResponse';
  places: Array<Place>;
  total: Scalars['Int']['output'];
};

export type Query = {
  __typename?: 'Query';
  currentUser?: Maybe<User>;
  place: Place;
  placeReviews: PlaceReviews;
  places: PlacesResponse;
  userReviewActivity: Array<UserReviewActivity>;
};


export type QueryPlaceArgs = {
  placeId: Scalars['ID']['input'];
};


export type QueryPlaceReviewsArgs = {
  placeId: Scalars['ID']['input'];
};


export type QueryPlacesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
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
  userId: Scalars['ID']['output'];
  userName: Scalars['String']['output'];
  userRating?: Maybe<Scalars['Float']['output']>;
};

export type SuccessResponse = {
  __typename?: 'SuccessResponse';
  pendingEmail?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type User = {
  __typename?: 'User';
  avatar?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isGoogleUserUserWithoutPassword: Scalars['Boolean']['output'];
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
  AuthPayload: ResolverTypeWrapper<Omit<AuthPayload, 'user'> & { user: ResolversTypes['User'] }>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Characteristic: Characteristic;
  CharacteristicCounts: ResolverTypeWrapper<CharacteristicCounts>;
  CharacteristicData: ResolverTypeWrapper<CharacteristicData>;
  ContactForm: ResolverTypeWrapper<ContactForm>;
  ContactFormResponse: ResolverTypeWrapper<ContactFormResponse>;
  DeleteReviewResult: ResolverTypeWrapper<DeleteReviewResult>;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  Geometry: ResolverTypeWrapper<Geometry>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  LogoutResponse: ResolverTypeWrapper<LogoutResponse>;
  Mutation: ResolverTypeWrapper<{}>;
  OpeningHour: ResolverTypeWrapper<OpeningHour>;
  Place: ResolverTypeWrapper<IPlace>;
  PlaceProperties: ResolverTypeWrapper<Omit<PlaceProperties, 'reviews'> & { reviews: Array<ResolversTypes['Review']> }>;
  PlaceReviews: ResolverTypeWrapper<Omit<PlaceReviews, 'reviews'> & { reviews: Array<ResolversTypes['Review']> }>;
  PlacesResponse: ResolverTypeWrapper<Omit<PlacesResponse, 'places'> & { places: Array<ResolversTypes['Place']> }>;
  Query: ResolverTypeWrapper<{}>;
  Review: ResolverTypeWrapper<IInteraction>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  SuccessResponse: ResolverTypeWrapper<SuccessResponse>;
  User: ResolverTypeWrapper<IUser>;
  UserReviewActivity: ResolverTypeWrapper<UserReviewActivity>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  AddRatingResponse: AddRatingResponse;
  AddTextReviewResponse: AddTextReviewResponse;
  AuthPayload: Omit<AuthPayload, 'user'> & { user: ResolversParentTypes['User'] };
  Boolean: Scalars['Boolean']['output'];
  CharacteristicCounts: CharacteristicCounts;
  CharacteristicData: CharacteristicData;
  ContactForm: ContactForm;
  ContactFormResponse: ContactFormResponse;
  DeleteReviewResult: DeleteReviewResult;
  Float: Scalars['Float']['output'];
  Geometry: Geometry;
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  JSON: Scalars['JSON']['output'];
  LogoutResponse: LogoutResponse;
  Mutation: {};
  OpeningHour: OpeningHour;
  Place: IPlace;
  PlaceProperties: Omit<PlaceProperties, 'reviews'> & { reviews: Array<ResolversParentTypes['Review']> };
  PlaceReviews: Omit<PlaceReviews, 'reviews'> & { reviews: Array<ResolversParentTypes['Review']> };
  PlacesResponse: Omit<PlacesResponse, 'places'> & { places: Array<ResolversParentTypes['Place']> };
  Query: {};
  Review: IInteraction;
  String: Scalars['String']['output'];
  SuccessResponse: SuccessResponse;
  User: IUser;
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

export type AuthPayloadResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AuthPayload'] = ResolversParentTypes['AuthPayload']> = {
  emailChanged?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  isFirstLogin?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  user?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
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

export type GeometryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Geometry'] = ResolversParentTypes['Geometry']> = {
  coordinates?: Resolver<Array<ResolversTypes['Float']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
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
  confirmEmail?: Resolver<ResolversTypes['AuthPayload'], ParentType, ContextType, RequireFields<MutationConfirmEmailArgs, 'email' | 'token'>>;
  contactForm?: Resolver<ResolversTypes['ContactFormResponse'], ParentType, ContextType, RequireFields<MutationContactFormArgs, 'email' | 'message' | 'name'>>;
  deleteAccount?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType>;
  deleteAvatar?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType>;
  deleteReview?: Resolver<ResolversTypes['DeleteReviewResult'], ParentType, ContextType, RequireFields<MutationDeleteReviewArgs, 'deleteOptions' | 'reviewId'>>;
  loginWithGoogle?: Resolver<Maybe<ResolversTypes['AuthPayload']>, ParentType, ContextType, RequireFields<MutationLoginWithGoogleArgs, 'code'>>;
  logout?: Resolver<Maybe<ResolversTypes['LogoutResponse']>, ParentType, ContextType>;
  registerUser?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationRegisterUserArgs, 'displayName' | 'email' | 'password'>>;
  resendConfirmationEmail?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationResendConfirmationEmailArgs, 'email'>>;
  setNewPassword?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationSetNewPasswordArgs, 'newPassword' | 'userId'>>;
  signInWithEmail?: Resolver<ResolversTypes['AuthPayload'], ParentType, ContextType, RequireFields<MutationSignInWithEmailArgs, 'email' | 'password'>>;
  toggleCharacteristic?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationToggleCharacteristicArgs, 'characteristic' | 'placeId'>>;
  toggleFavorite?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationToggleFavoriteArgs, 'placeId'>>;
  updatePersonalData?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationUpdatePersonalDataArgs, 'userId'>>;
  uploadAvatar?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationUploadAvatarArgs, 'fileUrl' | 'userId'>>;
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
  characteristicCounts?: Resolver<ResolversTypes['CharacteristicCounts'], ParentType, ContextType>;
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
  phone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  ratingCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  reviews?: Resolver<Array<ResolversTypes['Review']>, ParentType, ContextType>;
  website?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PlaceReviewsResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PlaceReviews'] = ResolversParentTypes['PlaceReviews']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  reviews?: Resolver<Array<ResolversTypes['Review']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PlacesResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PlacesResponse'] = ResolversParentTypes['PlacesResponse']> = {
  places?: Resolver<Array<ResolversTypes['Place']>, ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  currentUser?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  place?: Resolver<ResolversTypes['Place'], ParentType, ContextType, RequireFields<QueryPlaceArgs, 'placeId'>>;
  placeReviews?: Resolver<ResolversTypes['PlaceReviews'], ParentType, ContextType, RequireFields<QueryPlaceReviewsArgs, 'placeId'>>;
  places?: Resolver<ResolversTypes['PlacesResponse'], ParentType, ContextType, RequireFields<QueryPlacesArgs, 'limit' | 'offset'>>;
  userReviewActivity?: Resolver<Array<ResolversTypes['UserReviewActivity']>, ParentType, ContextType>;
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
  userId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  userName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userRating?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SuccessResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SuccessResponse'] = ResolversParentTypes['SuccessResponse']> = {
  pendingEmail?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UserResolvers<ContextType = Context, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = {
  avatar?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  displayName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isGoogleUserUserWithoutPassword?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
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
  AuthPayload?: AuthPayloadResolvers<ContextType>;
  CharacteristicCounts?: CharacteristicCountsResolvers<ContextType>;
  CharacteristicData?: CharacteristicDataResolvers<ContextType>;
  ContactForm?: ContactFormResolvers<ContextType>;
  ContactFormResponse?: ContactFormResponseResolvers<ContextType>;
  DeleteReviewResult?: DeleteReviewResultResolvers<ContextType>;
  Geometry?: GeometryResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  LogoutResponse?: LogoutResponseResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  OpeningHour?: OpeningHourResolvers<ContextType>;
  Place?: PlaceResolvers<ContextType>;
  PlaceProperties?: PlacePropertiesResolvers<ContextType>;
  PlaceReviews?: PlaceReviewsResolvers<ContextType>;
  PlacesResponse?: PlacesResponseResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Review?: ReviewResolvers<ContextType>;
  SuccessResponse?: SuccessResponseResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
  UserReviewActivity?: UserReviewActivityResolvers<ContextType>;
};

