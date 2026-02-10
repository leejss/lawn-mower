export type SingleRunOptions = {
  mode: "single";
  url: string;
};

export type MainnewsRunOptions = {
  mode: "mainnews";
  page: number;
  limit: number;
  concurrency: number;
};

export type RunOptions = SingleRunOptions | MainnewsRunOptions;
