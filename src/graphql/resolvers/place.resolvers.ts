import places from "../../places.json" assert { type: "json" };

export const resolvers = {
  Query: {
    places: () => places,
  },
};
