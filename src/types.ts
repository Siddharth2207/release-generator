// GitHub Commit structure
export interface Commit {
    sha: string;
    commit: {
      message: string;
      author: {
        name: string;
        email: string;
        date: string;
      };
    };
  }
  
  // GitHub Pull Request structure
  export interface PullRequest {
    number: number;
    title: string;
    user: {
      login: string;
    };
    merged_at: string | null;
    body: string | null;
    merge_commit_sha: string;
  }
  
  // GitHub Release structure
  export interface ReleaseResponse {
    id: number;
    tag_name: string;
    name: string;
  }
  
  // Tag and Release naming convention structure
  export interface TagAndReleaseNames {
    tagName: string;
    releaseName: string;
  }
  
  // ChatGPT response message structure for code analysis
  export interface ChatGPTResponse {
    choices: {
      message: {
        content: string;
      };
    }[];
  }
  
  // Axios error type extension (optional, if handling axios errors)
  export interface AxiosError {
    response?: {
      status: number;
      data?: any;
    };
    message: string;
  }
  