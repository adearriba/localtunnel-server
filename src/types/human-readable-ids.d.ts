declare module "human-readable-ids" {
    // List of adjectives and animals
    interface Lists {
        adjectives: string[];
        animals: string[];
    }

    // Function to shuffle an array (Knuth Shuffle)
    type ShuffleFunction = <T>(array: T[]) => T[];

    // Interface for the humanReadableIds object
    interface HumanReadableIds {
        random: () => string;
    }

    // The main export of the module
    export const humanReadableIds: HumanReadableIds;
    export const hri: HumanReadableIds;
}
