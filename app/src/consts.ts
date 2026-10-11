export const DATA_SOURCE_OPTIONS = ['File Upload'] as const;

export type DataSource = (typeof DATA_SOURCE_OPTIONS)[number];
