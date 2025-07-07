import { GraphQLResolveInfo } from 'graphql';
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
  contactForm: ContactFormResponse;
  deleteAvatar: SuccessResponse;
  deleteReview: DeleteReviewResult;
  loginWithGoogle?: Maybe<AuthPayload>;
  logout?: Maybe<LogoutResponse>;
  registerUser: AuthPayload;
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

export type Place = {
  __typename?: 'Place';
  geometry: Geometry;
  id: Scalars['ID']['output'];
  properties: PlaceProperties;
  type: Scalars['String']['output'];
};

export type PlaceProperties = {
  __typename?: 'PlaceProperties';
  address: Scalars['String']['output'];
  averageRating?: Maybe<Scalars['Float']['output']>;
  characteristicCounts: CharacteristicCounts;
  description: Scalars['String']['output'];
  favoriteCount: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  image: Scalars['String']['output'];
  instagram: Scalars['String']['output'];
  isFavorite: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  ratingCount: Scalars['Int']['output'];
  reviews: Array<Review>;
};

export type PlaceReviews = {
  __typename?: 'PlaceReviews';
  id: Scalars['ID']['output'];
  reviews: Array<Review>;
};

export type Query = {
  __typename?: 'Query';
  currentUser?: Maybe<User>;
  getUserReviewActivity: Array<UserReviewActivity>;
  placeReviews: PlaceReviews;
  places: Array<Place>;
};


export type QueryPlaceReviewsArgs = {
  placeId: Scalars['ID']['input'];
};

export type Review = {
  __typename?: 'Review';
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isOwnReview: Scalars['Boolean']['output'];
  placeId: Scalars['ID']['output'];
  text?: Maybe<Scalars['String']['output']>;
  userAvatar?: Maybe<Scalars['String']['output']>;
  userId: Scalars['ID']['output'];
  userName: Scalars['String']['output'];
  userRating?: Maybe<Scalars['Float']['output']>;
};

export type SuccessResponse = {
  __typename?: 'SuccessResponse';
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
  LogoutResponse: ResolverTypeWrapper<LogoutResponse>;
  Mutation: ResolverTypeWrapper<{}>;
  Place: ResolverTypeWrapper<IPlace>;
  PlaceProperties: ResolverTypeWrapper<Omit<PlaceProperties, 'reviews'> & { reviews: Array<ResolversTypes['Review']> }>;
  PlaceReviews: ResolverTypeWrapper<Omit<PlaceReviews, 'reviews'> & { reviews: Array<ResolversTypes['Review']> }>;
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
  LogoutResponse: LogoutResponse;
  Mutation: {};
  Place: IPlace;
  PlaceProperties: Omit<PlaceProperties, 'reviews'> & { reviews: Array<ResolversParentTypes['Review']> };
  PlaceReviews: Omit<PlaceReviews, 'reviews'> & { reviews: Array<ResolversParentTypes['Review']> };
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

export type LogoutResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['LogoutResponse'] = ResolversParentTypes['LogoutResponse']> = {
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type MutationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  addRating?: Resolver<ResolversTypes['AddRatingResponse'], ParentType, ContextType, RequireFields<MutationAddRatingArgs, 'placeId' | 'rating'>>;
  addTextReview?: Resolver<ResolversTypes['AddTextReviewResponse'], ParentType, ContextType, RequireFields<MutationAddTextReviewArgs, 'placeId' | 'text'>>;
  contactForm?: Resolver<ResolversTypes['ContactFormResponse'], ParentType, ContextType, RequireFields<MutationContactFormArgs, 'email' | 'message' | 'name'>>;
  deleteAvatar?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType>;
  deleteReview?: Resolver<ResolversTypes['DeleteReviewResult'], ParentType, ContextType, RequireFields<MutationDeleteReviewArgs, 'deleteOptions' | 'reviewId'>>;
  loginWithGoogle?: Resolver<Maybe<ResolversTypes['AuthPayload']>, ParentType, ContextType, RequireFields<MutationLoginWithGoogleArgs, 'code'>>;
  logout?: Resolver<Maybe<ResolversTypes['LogoutResponse']>, ParentType, ContextType>;
  registerUser?: Resolver<ResolversTypes['AuthPayload'], ParentType, ContextType, RequireFields<MutationRegisterUserArgs, 'displayName' | 'email' | 'password'>>;
  setNewPassword?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationSetNewPasswordArgs, 'newPassword' | 'userId'>>;
  signInWithEmail?: Resolver<ResolversTypes['AuthPayload'], ParentType, ContextType, RequireFields<MutationSignInWithEmailArgs, 'email' | 'password'>>;
  toggleCharacteristic?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationToggleCharacteristicArgs, 'characteristic' | 'placeId'>>;
  toggleFavorite?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationToggleFavoriteArgs, 'placeId'>>;
  updatePersonalData?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationUpdatePersonalDataArgs, 'userId'>>;
  uploadAvatar?: Resolver<ResolversTypes['SuccessResponse'], ParentType, ContextType, RequireFields<MutationUploadAvatarArgs, 'fileUrl' | 'userId'>>;
};

export type PlaceResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Place'] = ResolversParentTypes['Place']> = {
  geometry?: Resolver<ResolversTypes['Geometry'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  properties?: Resolver<ResolversTypes['PlaceProperties'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PlacePropertiesResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PlaceProperties'] = ResolversParentTypes['PlaceProperties']> = {
  address?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  averageRating?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  characteristicCounts?: Resolver<ResolversTypes['CharacteristicCounts'], ParentType, ContextType>;
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  favoriteCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  image?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  instagram?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  isFavorite?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ratingCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  reviews?: Resolver<Array<ResolversTypes['Review']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PlaceReviewsResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PlaceReviews'] = ResolversParentTypes['PlaceReviews']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  reviews?: Resolver<Array<ResolversTypes['Review']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  currentUser?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  getUserReviewActivity?: Resolver<Array<ResolversTypes['UserReviewActivity']>, ParentType, ContextType>;
  placeReviews?: Resolver<ResolversTypes['PlaceReviews'], ParentType, ContextType, RequireFields<QueryPlaceReviewsArgs, 'placeId'>>;
  places?: Resolver<Array<ResolversTypes['Place']>, ParentType, ContextType>;
};

export type ReviewResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Review'] = ResolversParentTypes['Review']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isOwnReview?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  placeId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  text?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  userAvatar?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  userName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userRating?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SuccessResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SuccessResponse'] = ResolversParentTypes['SuccessResponse']> = {
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
  LogoutResponse?: LogoutResponseResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  Place?: PlaceResolvers<ContextType>;
  PlaceProperties?: PlacePropertiesResolvers<ContextType>;
  PlaceReviews?: PlaceReviewsResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Review?: ReviewResolvers<ContextType>;
  SuccessResponse?: SuccessResponseResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
  UserReviewActivity?: UserReviewActivityResolvers<ContextType>;
};

