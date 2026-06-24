import { apiRequest } from "@/lib/api/apiClient";
import { getCollegeFit } from "@/services/testScoreService";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApiRequest = apiRequest as jest.Mock;

beforeEach(() => mockApiRequest.mockReset());

const college = (over: Record<string, unknown> = {}) => ({
  id: "col-1",
  name: "MIT",
  city: "Cambridge",
  state: "MA",
  acceptanceRate: 0.04,
  sat25: 1510,
  sat75: 1580,
  fit: "reach" as const,
  ...over,
});

describe("getCollegeFit", () => {
  it("unwraps {superscore, colleges} from the API response", async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: {
        superscore: 1500,
        colleges: [college()],
      },
    });

    const result = await getCollegeFit();

    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/v1/test-scores/college-fit",
      { method: "GET" }
    );
    expect(result.superscore).toBe(1500);
    expect(result.colleges).toHaveLength(1);
    expect(result.colleges[0].fit).toBe("reach");
  });

  it("returns {superscore:null, colleges:[]} when the API gives that", async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: {
        superscore: null,
        colleges: [],
      },
    });

    const result = await getCollegeFit();

    expect(result.superscore).toBeNull();
    expect(result.colleges).toEqual([]);
  });
});
