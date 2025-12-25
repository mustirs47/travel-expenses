import { a, defineData, type ClientSchema } from "@aws-amplify/backend";

const schema = a.schema({
  Trip: a
    .model({
      arrivalDate: a.date().required(),
      returnDate: a.date().required(),
      traveler: a.string().required(),
      isoWeek: a.integer().required(),
      title: a.string(),
    })
    .authorization((allow) => [allow.owner()]),

  Receipt: a
    .model({
      tripId: a.id().required(),
      date: a.date(),
      category: a.string().required(),
      currency: a.string().required(),
      exchangeRate: a.float().required(),
      costEur: a.float().required(),
      fileKey: a.string(),
      fileName: a.string(),
      mimeType: a.string(),
    })
    .secondaryIndexes((index) => [index("tripId")])
    .authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
});
