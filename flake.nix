{
  description = "Flake for development workflows.";

  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    rainix.url = "github:rainprotocol/rainix";
  };

  outputs = {self, rainix, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = rainix.pkgs.${system};
      in rec {
        packages = rec{

          build-js-bindings = rainix.mkTask.${system} {
            name = "build-js-bindings";
            body = ''
              set -euxo pipefail
              npm install
              npm run build
            '';
          };

          raindex-release = rainix.mkTask.${system} {
            name = "raindex-release";
            body = ''
              set -euxo pipefail
              node dist/raindex-release.js
              
            '';
          };

          rainlanguage-release = rainix.mkTask.${system} {
            name = "rainlanguage-release";
            body = ''
              set -euxo pipefail
              node dist/rainlanguage-release.js
              
            '';
          };
          
        } // rainix.packages.${system};

        devShells.default = pkgs.mkShell {
          packages = [
            packages.build-js-bindings
            packages.raindex-release
            packages.rainlanguage-release
          ];

          shellHook = rainix.devShells.${system}.default.shellHook;
          buildInputs = rainix.devShells.${system}.default.buildInputs;
          nativeBuildInputs = rainix.devShells.${system}.default.nativeBuildInputs;
        };

      }
    );

}